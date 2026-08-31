import type mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { ProductModel } from "@/models/product";
import { InventoryStateModel } from "@/models/inventory-state";
import {
  StockMovementModel,
  type StockMovementType,
} from "@/models/stock-movement";
import { ProductBatchModel } from "@/models/product-batch";
import {
  isLowStock,
  isOutOfStock,
  isExpired,
  isExpiringSoon,
  suggestedReplenishment,
  EXPIRING_SOON_DAYS,
} from "@/lib/inventory/stock";
import type {
  AdjustStockInput,
  StockCountInput,
  DamageInput,
  DisposeExpiredInput,
  MovementQuery,
} from "@/lib/validations/inventory";

/**
 * Inventory core (Phase 2).
 *
 * Stock is transaction-driven and never edited as a plain number. Every change
 * goes through an append-only StockMovement plus an atomic, versioned update of
 * the InventoryState cache. Multi-document changes run inside a MongoDB
 * transaction so state, movement, and audit stay consistent.
 *
 * Sellable stock:
 *  - non-expiry products  -> InventoryState.onHand
 *  - expiry-tracked       -> sum of non-expired ProductBatch quantities
 */

export interface ProductSellable {
  sellable: number;
  onHand: number;
  nonSellable: number;
}

interface StockChange {
  type: StockMovementType;
  quantity: number;
  reason: string;
  nonSellableDelta?: number;
  batch?: {
    id: string;
    code?: string;
  };
}

/** Creates the initial zero-state record for a newly created product. */
export async function createInitialInventoryState(
  productId: mongoose.Types.ObjectId,
): Promise<void> {
  await InventoryStateModel.create({
    product: productId,
    onHand: 0,
    nonSellable: 0,
    version: 1,
  });
}

/**
 * Computes the current sellable quantity for a product.
 * Non-expiry: InventoryState.onHand. Expiry-tracked: sum of non-expired batches.
 */
export async function getSellableStock(
  productId: string | mongoose.Types.ObjectId,
  trackExpiry?: boolean,
): Promise<ProductSellable> {
  await dbConnect();
  const state = await InventoryStateModel.findOne({ product: productId }).lean<{
    onHand: number;
    nonSellable: number;
  }>();

  if (!state) {
    return { sellable: 0, onHand: 0, nonSellable: 0 };
  }

  let track = trackExpiry;
  if (track === undefined) {
    const product = await ProductModel.findById(productId)
      .select("trackExpiry")
      .lean<{ trackExpiry: boolean }>();
    track = product?.trackExpiry ?? false;
  }

  if (track) {
    const now = new Date();
    const batches = await ProductBatchModel.find({
      product: productId,
      quantity: { $gt: 0 },
      expiryDate: { $gt: now },
    })
      .select("quantity")
      .lean<{ quantity: number }[]>();
    const sellable = batches.reduce((sum, b) => sum + b.quantity, 0);
    return { sellable, onHand: state.onHand, nonSellable: state.nonSellable };
  }

  return { sellable: state.onHand, onHand: state.onHand, nonSellable: state.nonSellable };
}

/**
 * Applies a signed stock delta under optimistic concurrency and records the
 * movement + audit atomically. Returns the updated sellable.
 *
 * `findOneAndUpdate({ product, version }, { $inc, version+1 })` guarantees only
 * one concurrent writer can mutate a given version, so racing decrements never
 * silently overwrite each other (BR-005 §9).
 */
async function applyStockChange(
  actor: AuthUser,
  productId: string,
  change: StockChange,
  requirePerm: "inventory.adjust" | "inventory.count" = "inventory.adjust",
): Promise<{ sellable: number; onHand: number; nonSellable: number }> {
  requirePermission(actor, requirePerm);
  await dbConnect();

  const product = await ProductModel.findById(productId)
    .select("name")
    .lean<{ name: string }>();
  if (!product) {
    throw new AppError("NOT_FOUND", "المنتج غير موجود");
  }

  return withTransaction(async (session) => {
    const spy = await InventoryStateModel.findOne({ product: productId })
      .session(session)
      .lean<{ version: number }>();
    if (!spy) {
      throw new AppError("NOT_FOUND", "لا توجد حالة مخزون لهذا المنتج");
    }

    const updated = await InventoryStateModel.findOneAndUpdate(
      { product: productId, version: spy.version },
      {
        $inc: { onHand: change.quantity, nonSellable: change.nonSellableDelta ?? 0 },
        $set: { version: spy.version + 1 },
      },
      { new: true, session, runValidators: false },
    )
      .select("onHand nonSellable")
      .lean<{ onHand: number; nonSellable: number }>();

    if (!updated) {
      throw new AppError(
        "CONFLICT",
        "تعذّر تحديث المخزون لأن بياناته تغيّرت. حاول مرة أخرى",
      );
    }

    if (updated.onHand < 0) {
      throw new AppError(
        "CONFLICT",
        "لا يوجد مخزون كافٍ لهذا المنتج لإتمام العملية",
      );
    }

    await StockMovementModel.create(
      [
        {
          product: productId,
          type: change.type,
          quantity: change.quantity,
          batch: change.batch?.id,
          batchCode: change.batch?.code,
          reason: change.reason,
          actorId: actor.id,
          actorUsername: actor.username,
        },
      ],
      { session },
    );

    await recordAudit({
      actorId: actor.id,
      actorUsername: actor.username,
      action: `inventory.${change.type.toLowerCase()}`,
      entity: "product",
      entityId: productId,
      after: {
        productId,
        quantity: change.quantity,
        type: change.type,
        reason: change.reason,
      },
    });

    return { sellable: updated.onHand, onHand: updated.onHand, nonSellable: updated.nonSellable };
  });
}

/**
 * Manual stock adjustment by a signed delta.
 * Positive adds stock; negative removes it. Requires `inventory.adjust`.
 */
export async function adjustStock(
  actor: AuthUser | null,
  input: AdjustStockInput,
): Promise<ProductSellable> {
  const authed = requirePermission(actor, "inventory.adjust");
  return applyStockChange(authed, input.productId, {
    type: "ADJUSTMENT",
    quantity: input.quantity,
    reason: input.reason,
  });
}

/**
 * Physical stock count (reconciliation). Requires `inventory.count`.
 * The delta is derived from the difference between the counted quantity and the
 * current sellable quantity and recorded as a STOCK_COUNT movement.
 */
export async function performStockCount(
  actor: AuthUser | null,
  input: StockCountInput,
): Promise<ProductSellable> {
  const authed = requirePermission(actor, "inventory.count");
  await dbConnect();

  const product = await ProductModel.findById(input.productId)
    .select("trackExpiry")
    .lean<{ trackExpiry: boolean }>();
  if (!product) {
    throw new AppError("NOT_FOUND", "المنتج غير موجود");
  }

  const current = await getSellableStock(input.productId, product.trackExpiry);
  const currentSellable = current.sellable;
  const delta = input.countedQuantity - currentSellable;

  const reason =
    delta >= 0
      ? `جرد: زيادة ${delta}${input.note ? ` (${input.note})` : ""}`
      : `جرد: نقص ${-delta}${input.note ? ` (${input.note})` : ""}`;

  return applyStockChange(authed, input.productId, {
    type: "STOCK_COUNT",
    quantity: delta,
    reason,
  });
}

/**
 * Records damaged stock: moves `quantity` from non-sellable to a DAMAGE record.
 * Requires `inventory.adjust`. Damaged goods are not sellable (BR-022).
 */
export async function recordDamage(
  actor: AuthUser | null,
  input: DamageInput,
): Promise<ProductSellable> {
  const authed = requirePermission(actor, "inventory.adjust");
  await dbConnect();

  const result = await applyStockChange(authed, input.productId, {
    type: "DAMAGE",
    quantity: -input.quantity,
    reason: input.reason,
    nonSellableDelta: input.quantity,
  });
  return result;
}

/**
 * Product stock summary shared by the low-stock / out-of-stock / replenishment
 * views. Uses batched reads to avoid N+1 queries.
 */
export interface ProductStockSummary {
  id: string;
  name: string;
  sku?: string;
  barcode?: string;
  unit: string;
  categoryId: string;
  categoryName: string;
  brandId?: string;
  brandName?: string;
  trackExpiry: boolean;
  active: boolean;
  minimumStock: number;
  sellingPrice: number;
  sellable: number;
  onHand: number;
  nonSellable: number;
  low: boolean;
  out: boolean;
  suggested: number;
}

async function buildSellableMap(products: { _id: mongoose.Types.ObjectId; trackExpiry: boolean }[]) {
  const productIds = products.map((p) => p._id);
  const states = await InventoryStateModel.find({ product: { $in: productIds } })
    .select("product onHand nonSellable")
    .lean<{ product: mongoose.Types.ObjectId; onHand: number; nonSellable: number }[]>();
  const stateMap = new Map<string, { onHand: number; nonSellable: number }>();
  for (const s of states) stateMap.set(s.product.toString(), { onHand: s.onHand, nonSellable: s.nonSellable });

  const batchMap = new Map<string, number>();
  const tracked = products.filter((p) => p.trackExpiry);
  if (tracked.length > 0) {
    const now = new Date();
    const batches = await ProductBatchModel.find({
      product: { $in: tracked.map((p) => p._id) },
      quantity: { $gt: 0 },
      expiryDate: { $gt: now },
    })
      .select("product quantity")
      .lean<{ product: mongoose.Types.ObjectId; quantity: number }[]>();
    for (const b of batches) {
      batchMap.set(b.product.toString(), (batchMap.get(b.product.toString()) ?? 0) + b.quantity);
    }
  }

  return new Map(
    products.map((p) => {
      const sid = p._id.toString();
      const st = stateMap.get(sid) ?? { onHand: 0, nonSellable: 0 };
      const sellable = p.trackExpiry ? (batchMap.get(sid) ?? 0) : st.onHand;
      return [sid, { sellable, onHand: st.onHand, nonSellable: st.nonSellable }];
    }),
  );
}

/** Loads a full product stock summary list. Requires `inventory.read`. */
export async function listProductStockSummary(actor: AuthUser | null): Promise<ProductStockSummary[]> {
  requirePermission(actor, "inventory.read");
  await dbConnect();

  const products = await ProductModel.find()
    .populate("category", "name")
    .populate("brand", "name")
    .sort({ name: 1 })
    .lean<Array<{
      _id: mongoose.Types.ObjectId;
      name: string;
      sku?: string;
      barcode?: string;
      unit: string;
      category: { _id: mongoose.Types.ObjectId; name: string };
      brand?: { _id: mongoose.Types.ObjectId; name: string } | null;
      trackExpiry: boolean;
      active: boolean;
      minimumStock: number;
      sellingPrice: number;
    }>>();

  const sellableMap = await buildSellableMap(products);

  return products.map((p) => {
    const sid = p._id.toString();
    const stock = sellableMap.get(sid) ?? { sellable: 0, onHand: 0, nonSellable: 0 };
    const low = isLowStock(stock.sellable, p.minimumStock);
    const out = isOutOfStock(stock.sellable);
    return {
      id: sid,
      name: p.name,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      categoryId: p.category?._id?.toString() ?? "",
      categoryName: p.category?.name ?? "",
      brandId: p.brand?._id?.toString(),
      brandName: p.brand?.name,
      trackExpiry: p.trackExpiry,
      active: p.active,
      minimumStock: p.minimumStock,
      sellingPrice: p.sellingPrice,
      sellable: stock.sellable,
      onHand: stock.onHand,
      nonSellable: stock.nonSellable,
      low,
      out,
      suggested: suggestedReplenishment(stock.sellable, p.minimumStock),
    };
  });
}

/** Lists low-stock products (sellable <= minimum). Requires `inventory.read`. */
export async function getLowStockProducts(actor: AuthUser | null): Promise<ProductStockSummary[]> {
  const all = await listProductStockSummary(actor);
  return all.filter((p) => p.low);
}

/** Lists out-of-stock products (sellable <= 0). Requires `inventory.read`. */
export async function getOutOfStockProducts(actor: AuthUser | null): Promise<ProductStockSummary[]> {
  const all = await listProductStockSummary(actor);
  return all.filter((p) => p.out);
}

/** Returns replenishment suggestions (sellable < minimum). Requires `inventory.view_replenishment`. */
export async function getReplenishmentSuggestions(actor: AuthUser | null): Promise<ProductStockSummary[]> {
  requirePermission(actor, "inventory.view_replenishment");
  const all = await listProductStockSummary(actor);
  return all.filter((p) => p.suggested > 0).sort((a, b) => b.suggested - a.suggested);
}

export interface ExpiryBatchDto {
  batchId: string;
  batchCode?: string;
  productId: string;
  productName: string;
  quantity: number;
  expiryDate: string;
  status: "expiring" | "expired";
  daysRemaining: number;
}

async function loadExpiryBatches(actor: AuthUser | null): Promise<
  Array<{ _id: mongoose.Types.ObjectId; batchCode?: string; product: mongoose.Types.ObjectId; quantity: number; expiryDate: Date; productName: string }>
> {
  requirePermission(actor, "inventory.view_expiry");
  await dbConnect();
  const batches = await ProductBatchModel.find({ quantity: { $gt: 0 } })
    .sort({ expiryDate: 1 })
    .lean<Array<{
      _id: mongoose.Types.ObjectId;
      batchCode?: string;
      product: mongoose.Types.ObjectId;
      quantity: number;
      expiryDate: Date;
    }>>();
  const productIds = Array.from(new Set(batches.map((b) => b.product.toString())));
  const products = await ProductModel.find({ _id: { $in: productIds } })
    .select("name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  const nameMap = new Map(products.map((p) => [p._id.toString(), p.name]));
  return batches.map((b) => ({
    ...b,
    productName: nameMap.get(b.product.toString()) ?? "",
  }));
}

/** Lists all expiry-relevant batches (expiring soon or already expired). */
export async function getExpiryBatches(actor: AuthUser | null): Promise<ExpiryBatchDto[]> {
  const batches = await loadExpiryBatches(actor);
  const now = new Date();
  return batches.flatMap((b) => {
    const expired = isExpired(b.expiryDate, now);
    const expiring = !expired && isExpiringSoon(b.expiryDate, EXPIRING_SOON_DAYS, now);
    if (!expired && !expiring) return [];
    return [
      {
        batchId: b._id.toString(),
        batchCode: b.batchCode,
        productId: b.product.toString(),
        productName: b.productName,
        quantity: b.quantity,
        expiryDate: b.expiryDate.toISOString(),
        status: (expired ? "expired" : "expiring") as "expired" | "expiring",
        daysRemaining: Math.ceil((b.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      },
    ];
  });
}

/** Summary of expiry attention items. Requires `inventory.view_expiry`. */
export async function getExpirySummary(actor: AuthUser | null): Promise<{
  expiringCount: number;
  expiredCount: number;
  totalBatches: number;
}> {
  const batches = await loadExpiryBatches(actor);
  const now = new Date();
  let expiring = 0;
  let expired = 0;
  for (const b of batches) {
    if (isExpired(b.expiryDate, now)) expired++;
    else if (isExpiringSoon(b.expiryDate, EXPIRING_SOON_DAYS, now)) expiring++;
  }
  return { expiringCount: expiring, expiredCount: expired, totalBatches: batches.length };
}

/**
 * Disposes an expired batch: records an EXPIRY write-off movement and zeroes the
 * batch so it no longer contributes to sellable stock. Requires `inventory.adjust`.
 */
export async function disposeExpired(
  actor: AuthUser | null,
  input: DisposeExpiredInput,
): Promise<{ batchId: string; quantity: number }> {
  const authed = requirePermission(actor, "inventory.adjust");
  await dbConnect();

  return withTransaction(async (session) => {
    const batch = await ProductBatchModel.findById(input.batchId)
      .session(session)
      .select("product batchCode quantity expiryDate")
      .lean<{ _id: mongoose.Types.ObjectId; product: mongoose.Types.ObjectId; batchCode?: string; quantity: number; expiryDate: Date }>();
    if (!batch) {
      throw new AppError("NOT_FOUND", "الدفعة غير موجودة");
    }
    if (batch.quantity <= 0) {
      throw new AppError("CONFLICT", "هذه الدفعة لا تحتوي على كمية للتخلص منها");
    }
    if (!isExpired(batch.expiryDate)) {
      throw new AppError("VALIDATION", "لا يمكن التخلص من دفعة لم تنته صلاحيتها بعد");
    }

    // Zero out the batch quantity (this is the expired/non-sellable write-off).
    await ProductBatchModel.updateOne(
      { _id: batch._id },
      { $set: { quantity: 0 } },
      { session },
    );

    await StockMovementModel.create(
      [
        {
          product: batch.product,
          type: "EXPIRY" as StockMovementType,
          quantity: -batch.quantity,
          batch: batch._id,
          batchCode: batch.batchCode,
          reason: "التخلص من بضاعة منتهية الصلاحية",
          actorId: authed.id,
          actorUsername: authed.username,
        },
      ],
      { session },
    );

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "inventory.expiry",
      entity: "product",
      entityId: batch.product.toString(),
      after: {
        batchId: batch._id.toString(),
        quantity: -batch.quantity,
        reason: "التخلص من بضاعة منتهية الصلاحية",
      },
    });

    return { batchId: batch._id.toString(), quantity: batch.quantity };
  });
}

export interface MovementDto {
  id: string;
  productId: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  batchCode: string;
  reason: string;
  actorUsername: string;
  createdAt: string;
}

/** Lists paginated stock movements. Requires `inventory.view_movements`. */
export async function listMovements(
  actor: AuthUser | null,
  query: MovementQuery,
): Promise<{ movements: MovementDto[]; total: number; page: number; pageSize: number }> {
  requirePermission(actor, "inventory.view_movements");
  await dbConnect();

  const filter: Record<string, unknown> = {};
  if (query.productId) filter.product = query.productId;
  if (query.type) filter.type = query.type;

  const [movements, total] = await Promise.all([
    StockMovementModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean<Array<{ _id: mongoose.Types.ObjectId; product: mongoose.Types.ObjectId; type: StockMovementType; quantity: number; batchCode?: string; reason: string; actorUsername?: string; createdAt?: Date }>>(),
    StockMovementModel.countDocuments(filter),
  ]);

  const productIds = Array.from(new Set(movements.map((m) => m.product.toString())));
  const products = await ProductModel.find({ _id: { $in: productIds } })
    .select("name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  const nameMap = new Map(products.map((p) => [p._id.toString(), p.name]));

  return {
    movements: movements.map((m) => ({
      id: m._id.toString(),
      productId: m.product.toString(),
      productName: nameMap.get(m.product.toString()) ?? "",
      type: m.type,
      quantity: m.quantity,
      batchCode: m.batchCode ?? "",
      reason: m.reason,
      actorUsername: m.actorUsername ?? "",
      createdAt: m.createdAt?.toISOString() ?? "",
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Lists a product's batches (with remaining quantity). Requires `inventory.view_expiry`. */
export async function listProductBatches(
  actor: AuthUser | null,
  productId: string,
): Promise<Array<{ id: string; batchCode: string; quantity: number; expiryDate: string; expired: boolean }>> {
  requirePermission(actor, "inventory.view_expiry");
  await dbConnect();
  const batches = await ProductBatchModel.find({ product: productId, quantity: { $gt: 0 } })
    .sort({ expiryDate: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; batchCode?: string; quantity: number; expiryDate: Date }>>();
  const now = new Date();
  return batches.map((b) => ({
    id: b._id.toString(),
    batchCode: b.batchCode ?? "",
    quantity: b.quantity,
    expiryDate: b.expiryDate.toISOString(),
    expired: isExpired(b.expiryDate, now),
  }));
}
