import type mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import { paymentMethodLabel } from "@/lib/sales/constants";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { PurchaseModel, type PurchaseStatus } from "@/models/purchase";
import { SupplierModel } from "@/models/supplier";
import { SupplierLedgerModel } from "@/models/supplier-ledger";
import { SupplierPaymentModel } from "@/models/supplier-payment";
import { SupplierReturnModel } from "@/models/supplier-return";
import { ProductModel } from "@/models/product";
import { nextSequenceValue } from "@/models/sequence";
import {
  receivePurchaseStock,
  removeReturnedStock,
} from "@/services/inventory.service";
import type {
  PurchaseCreateInput,
  ReceivePurchaseInput,
  SupplierPaymentInput,
  SupplierReturnInput,
} from "@/lib/validations/purchasing";

/**
 * Purchasing core (Phase 3): purchases, receiving, supplier payments, returns.
 *
 * Financial integrity:
 *  - Purchases produce a supplier ledger entry (+amount, adds payable) unless
 *    fully paid immediately, in which case no payable is created (BR-015/016).
 *  - Payments produce a negative ledger entry (reduces payable) and are stored
 *    as immutable historical documents (BR-017).
 *  - Returns produce a negative ledger entry and remove stock (BR-025/026).
 *  - All multi-document financial writes run inside a transaction so the
 *    purchase/payment/return, ledger entry, stock movement, and audit commit or
 *    roll back together (BR-021).
 */

export interface PurchaseItemDto {
  productId: string;
  productName: string;
  quantity: number;
  cost: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  lineTotal: number;
  batchCode: string;
  expiryDate: string;
}

export interface PurchaseDto {
  id: string;
  purchaseNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  paymentTerms: string;
  items: PurchaseItemDto[];
  totalAmount: number;
  receivedQuantity: number;
  status: PurchaseStatus;
  paid: boolean;
  createdAt: string;
}

function toPurchaseDto(
  p: {
    _id: mongoose.Types.ObjectId | string;
    purchaseNumber: string;
    supplier: mongoose.Types.ObjectId | string;
    supplierName: string;
    invoiceNumber?: string;
    paymentTerms?: string;
    items?: Array<{
      product: unknown;
      productName: string;
      quantity: number;
      cost: number;
      receivedQuantity: number;
      rejectedQuantity: number;
      lineTotal: number;
      batchCode?: string;
      expiryDate?: Date;
    }>;
    totalAmount: number;
    receivedQuantity?: number;
    status?: PurchaseStatus;
    paid?: boolean;
    createdAt?: Date;
  },
): PurchaseDto {
  return {
    id: p._id.toString(),
    purchaseNumber: p.purchaseNumber,
    supplierId: p.supplier.toString(),
    supplierName: p.supplierName,
    invoiceNumber: p.invoiceNumber ?? "",
    paymentTerms: p.paymentTerms ?? "",
    items: (p.items ?? []).map((it) => ({
      productId: (it.product as { toString?: () => string } | string)?.toString?.() ?? String(it.product),
      productName: it.productName,
      quantity: it.quantity,
      cost: it.cost,
      receivedQuantity: it.receivedQuantity,
      rejectedQuantity: it.rejectedQuantity,
      lineTotal: it.lineTotal,
      batchCode: it.batchCode ?? "",
      expiryDate: it.expiryDate?.toISOString() ?? "",
    })),
    totalAmount: p.totalAmount,
    receivedQuantity: p.receivedQuantity ?? 0,
    status: p.status ?? "PENDING",
    paid: p.paid ?? false,
    createdAt: p.createdAt?.toISOString() ?? "",
  };
}

async function nextNumber(
  prefix: string,
  _collection: mongoose.Model<unknown>,
  session?: mongoose.ClientSession,
): Promise<string> {
  // Atomic, concurrency-safe numbering (mirrors sales/cafe). The old
  // `countDocuments + 1` was racy: two concurrent creates could receive the same
  // number. findOneAndUpdate($inc) via nextSequenceValue guarantees each caller a
  // distinct, monotonically increasing value.
  const seq = await nextSequenceValue(`${prefix.toLowerCase()}-counter`, session);
  return `${prefix}-${String(seq).padStart(4, "0")}`;
}

async function loadSupplier(id: string): Promise<{ _id: mongoose.Types.ObjectId; name: string }> {
  const supplier = await SupplierModel.findById(id).lean<{ _id: mongoose.Types.ObjectId; name: string }>();
  if (!supplier) throw new AppError("NOT_FOUND", "المورد غير موجود");
  return supplier;
}

async function loadProducts(
  ids: string[],
): Promise<Map<string, { trackExpiry: boolean; name: string }>> {
  const products = await ProductModel.find({ _id: { $in: ids } })
    .select("trackExpiry name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; trackExpiry: boolean; name: string }>>();
  const map = new Map<string, { trackExpiry: boolean; name: string }>();
  for (const p of products) map.set(p._id.toString(), { trackExpiry: p.trackExpiry, name: p.name });
  return map;
}

/**
 * Creates a purchase and appends the matching supplier ledger entry / payment.
 * Requires `purchases.create`.
 *
 * Totals are always recomputed server-side from the received items; the client
 * never supplies totals. If `paidImmediately` is true the purchase contributes
 * no payable and an initial payment is recorded (BR-015); otherwise the full
 * total becomes payable (BR-016).
 */
export async function createPurchase(
  actor: AuthUser | null,
  input: PurchaseCreateInput,
): Promise<PurchaseDto> {
  const authed = requirePermission(actor, "purchases.create");
  await dbConnect();

  const supplier = await loadSupplier(input.supplierId);
  const productMap = await loadProducts(input.items.map((i) => i.productId));

  for (const item of input.items) {
    if (!productMap.has(item.productId)) {
      throw new AppError("NOT_FOUND", "أحد المنتجات غير موجود");
    }
    const prod = productMap.get(item.productId)!;
    if (prod.trackExpiry && !item.expiryDate) {
      throw new AppError("VALIDATION", `أدخل تاريخ انتهاء الصلاحية لمنتج ${prod.name}`);
    }
  }

  // Recompute total server-side.
  const items = input.items.map((it) => {
    const product = productMap.get(it.productId)!;
    const lineTotal = Math.round(it.quantity * it.cost * 100) / 100;
    return {
      product: it.productId,
      productName: product.name,
      quantity: it.quantity,
      cost: it.cost,
      receivedQuantity: 0,
      rejectedQuantity: 0,
      lineTotal,
      batchCode: it.batchCode ?? "",
      expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
    };
  });
  const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);

  return withTransaction(async (session) => {
    const purchaseNumber = await nextNumber("P", PurchaseModel as unknown as mongoose.Model<unknown>, session);
    const [purchase] = await PurchaseModel.create(
      [
        {
          purchaseNumber,
          supplier: supplier._id,
          supplierName: supplier.name,
          invoiceNumber: input.invoiceNumber ?? "",
          paymentTerms: input.paymentTerms ?? "",
          items,
          totalAmount,
          receivedQuantity: 0,
          status: "PENDING",
          paid: input.paidImmediately ?? false,
          createdBy: { id: authed.id, username: authed.username },
        },
      ],
      { session },
    );
    if (!purchase) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء إنشاء المشتريات");

    if (input.paidImmediately) {
      // Cash purchase: no payable; record the payment as an immediate payment.
      await SupplierPaymentModel.create(
        [
          {
            supplier: supplier._id,
            amount: totalAmount,
            method: "CASH",
            createdBy: { id: authed.id, username: authed.username },
          },
        ],
        { session },
      );
      await SupplierLedgerModel.create(
        [
          {
            supplier: supplier._id,
            type: "PURCHASE",
            amount: 0,
            referenceType: "PURCHASE",
            referenceId: purchase._id.toString(),
            description: `شراء نقدي ${purchaseNumber}`,
            settled: true,
          },
        ],
        { session },
      );
    } else {
      await SupplierLedgerModel.create(
        [
          {
            supplier: supplier._id,
            type: "PURCHASE",
            amount: totalAmount,
            referenceType: "PURCHASE",
            referenceId: purchase._id.toString(),
            description: `شراء ${purchaseNumber}`,
            settled: false,
          },
        ],
        { session },
      );
    }

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "purchase.created",
      entity: "purchase",
      entityId: purchase._id.toString(),
      after: {
        purchaseNumber,
        supplierId: supplier._id.toString(),
        totalAmount,
        itemCount: items.length,
      },
    });

    return toPurchaseDto(purchase);
  });
}

/**
 * Receives accepted quantities for a PENDING purchase and increases inventory.
 * Requires `purchases.receive`.
 *
 * Marks items as received/rejected, re-derives status, and records the stock +
 * returned stock via the inventory service (PURCHASE movements, BR-025). Runs in
 * one transaction: purchase update + inventory receiving.
 */
export async function receivePurchase(
  actor: AuthUser | null,
  input: ReceivePurchaseInput,
): Promise<PurchaseDto> {
  const authed = requirePermission(actor, "purchases.receive");
  await dbConnect();

  const purchase = await PurchaseModel.findById(input.purchaseId);
  if (!purchase) throw new AppError("NOT_FOUND", "المشتريات غير موجودة");
  if (purchase.status === "RECEIVED") {
    throw new AppError("CONFLICT", "تم استلام هذه المشتريات بالكامل بالفعل");
  }

  const itemById = new Map(purchase.items.map((it) => [it.product.toString(), it]));
  const receiveItems: Array<{
    productId: string;
    productName: string;
    quantity: number;
    trackExpiry: boolean;
    batchCode?: string;
    expiryDate?: string;
  }> = [];
  const updateOps: Array<{
    productId: string;
    acceptedQuantity: number;
    rejectedQuantity: number;
  }> = [];

  for (const it of input.items) {
    const existing = itemById.get(it.productId);
    if (!existing) {
      throw new AppError("VALIDATION", "أحد المنتجات غير موجود ضمن هذه المشتريات");
    }
    const alreadyReceived = existing.receivedQuantity;
    const remaining = existing.quantity - alreadyReceived;
    if (it.acceptedQuantity + it.rejectedQuantity > remaining) {
      throw new AppError(
        "VALIDATION",
        "الكمية المقبولة والمرفوضة تتجاوز الكمية المتبقية للاستلام",
      );
    }

    const product = await ProductModel.findById(it.productId)
      .select("trackExpiry")
      .lean<{ trackExpiry: boolean }>();
    if (!product) throw new AppError("NOT_FOUND", "أحد المنتجات غير موجود");

    if (it.acceptedQuantity > 0) {
      receiveItems.push({
        productId: it.productId,
        productName: existing.productName,
        quantity: it.acceptedQuantity,
        trackExpiry: product.trackExpiry,
        batchCode: existing.batchCode,
        expiryDate: existing.expiryDate?.toISOString(),
      });
    }
    updateOps.push({
      productId: it.productId,
      acceptedQuantity: it.acceptedQuantity,
      rejectedQuantity: it.rejectedQuantity,
    });
  }

  return withTransaction(async (session) => {
    const itemMap = new Map(purchase.items.map((x) => [x.product.toString(), x]));
    for (const op of updateOps) {
      const it = itemMap.get(op.productId)!;
      it.receivedQuantity += op.acceptedQuantity;
      it.rejectedQuantity += op.rejectedQuantity;
    }
    purchase.receivedQuantity = purchase.items.reduce((s, i) => s + i.receivedQuantity, 0);

    const totalOrdered = purchase.items.reduce((s, i) => s + i.quantity, 0);
    const allReceived = purchase.receivedQuantity >= totalOrdered;
    purchase.status = allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await purchase.save({ session });

    if (receiveItems.length > 0) {
      await receivePurchaseStock(authed, receiveItems, {
        referenceId: purchase._id.toString(),
        session,
      });
    }

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "purchase.received",
      entity: "purchase",
      entityId: purchase._id.toString(),
      after: { items: updateOps },
    });

    return toPurchaseDto(purchase);
  });
}

/** Records a supplier payment and reduces payable. Requires `supplier_payments.create`. */
export async function createSupplierPayment(
  actor: AuthUser | null,
  input: SupplierPaymentInput,
): Promise<{ id: string; amount: number }> {
  const authed = requirePermission(actor, "supplier_payments.create");
  await dbConnect();
  const supplier = await loadSupplier(input.supplierId);

  return withTransaction(async (session) => {
    // Idempotency: replaying the same key returns the existing payment so a
    // retry after a lost response never double-posts money against the supplier.
    if (input.idempotencyKey) {
      const existing = await SupplierPaymentModel.findOne({
        idempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean<{ _id: mongoose.Types.ObjectId; amount: number }>();
      if (existing) {
        return { id: existing._id.toString(), amount: existing.amount };
      }
    }

    const [payment] = await SupplierPaymentModel.create(
      [
        {
          supplier: supplier._id,
          amount: input.amount,
          method: input.method,
          createdBy: { id: authed.id, username: authed.username },
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session },
    );
    if (!payment) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء تسجيل الدفعة");

    await SupplierLedgerModel.create(
      [
        {
          supplier: supplier._id,
          type: "PAYMENT",
          amount: -input.amount,
          referenceType: "PAYMENT",
          referenceId: payment._id.toString(),
          description: `دفعة للمورد (${paymentMethodLabel(input.method)})`,
          settled: true,
        },
      ],
      { session },
    );

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "supplier.payment",
      entity: "supplier",
      entityId: supplier._id.toString(),
      after: { paymentId: payment._id.toString(), amount: input.amount, method: input.method },
    });

    return { id: payment._id.toString(), amount: payment.amount };
  });
}

/**
 * Records a supplier return: removes stock and reduces payable. Requires
 * `purchases.return`.
 *
 * The return total is recomputed server-side and produces a negative ledger
 * entry for the supplier balance, plus SUPPLIER_RETURN stock movements.
 */
export async function createSupplierReturn(
  actor: AuthUser | null,
  input: SupplierReturnInput,
): Promise<{ id: string; totalAmount: number }> {
  const authed = requirePermission(actor, "purchases.return");
  await dbConnect();

  const supplier = await loadSupplier(input.supplierId);
  const productMap = await loadProducts(input.items.map((i) => i.productId));
  for (const it of input.items) {
    if (!productMap.has(it.productId)) {
      throw new AppError("NOT_FOUND", "أحد المنتجات غير موجود");
    }
  }

  let purchase: { _id: mongoose.Types.ObjectId; purchaseNumber: string } | null = null;
  if (input.purchaseId) {
    const p = await PurchaseModel.findById(input.purchaseId)
      .select("purchaseNumber")
      .lean<{ _id: mongoose.Types.ObjectId; purchaseNumber: string }>();
    if (!p) throw new AppError("NOT_FOUND", "المشتريات غير موجودة");
    purchase = p;
  }

  const items = input.items.map((it) => {
    const product = productMap.get(it.productId)!;
    return {
      product: it.productId,
      productName: product.name,
      cost: it.cost,
      quantity: it.quantity,
      reason: it.reason ?? "",
      lineTotal: Math.round(it.quantity * it.cost * 100) / 100,
    };
  });
  const totalAmount = items.reduce((s, i) => s + i.lineTotal, 0);

  const returnItems = items.map((i) => {
    const product = productMap.get(i.product.toString());
    return {
      productId: i.product.toString(),
      productName: i.productName,
      quantity: i.quantity,
      trackExpiry: product?.trackExpiry ?? false,
    };
  });

  return withTransaction(async (session) => {
    const returnNumber = await nextNumber("R", SupplierReturnModel as unknown as mongoose.Model<unknown>, session);
    const [ret] = await SupplierReturnModel.create(
      [
        {
          returnNumber,
          supplier: supplier._id,
          supplierName: supplier.name,
          purchase: purchase?._id,
          purchaseNumber: purchase?.purchaseNumber ?? "",
          items,
          totalAmount,
          createdBy: { id: authed.id, username: authed.username },
        },
      ],
      { session },
    );
    if (!ret) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء تسجيل المرتد");

    await SupplierLedgerModel.create(
      [
        {
          supplier: supplier._id,
          type: "RETURN",
          amount: -totalAmount,
          referenceType: "SUPPLIER_RETURN",
          referenceId: ret._id.toString(),
          description: `مرتجع ${returnNumber}`,
          settled: true,
        },
      ],
      { session },
    );

    // Remove returned quantities from stock (FEFO-aware within inventory service).
    await removeReturnedStock(authed, returnItems, {
      referenceId: ret._id.toString(),
      session,
    });

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "supplier.return",
      entity: "supplier_return",
      entityId: ret._id.toString(),
      after: { returnNumber, totalAmount, itemCount: items.length },
    });

    return { id: ret._id.toString(), totalAmount };
  });
}

/** Lists purchases with pagination. Requires `purchases.read`. */
export async function listPurchases(
  actor: AuthUser | null,
  query: { supplierId?: string; status?: PurchaseStatus | "ALL"; page: number; pageSize: number },
): Promise<{ items: PurchaseDto[]; total: number; page: number; pageSize: number }> {
  requirePermission(actor, "purchases.read");
  await dbConnect();
  const filter: Record<string, unknown> = {};
  if (query.supplierId) filter.supplier = query.supplierId;
  if (query.status && query.status !== "ALL") filter.status = query.status;

  const [items, total] = await Promise.all([
    PurchaseModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    PurchaseModel.countDocuments(filter),
  ]);

  return {
    items: items.map((p) => toPurchaseDto(p)),
    total,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** Gets a single purchase. Requires `purchases.read`. */
export async function getPurchase(actor: AuthUser | null, id: string): Promise<PurchaseDto> {
  requirePermission(actor, "purchases.read");
  await dbConnect();
  const purchase = await PurchaseModel.findById(id).lean();
  if (!purchase) throw new AppError("NOT_FOUND", "المشتريات غير موجودة");
  return toPurchaseDto(purchase);
}

/** Lists purchases for a supplier. Requires `purchases.read`. */
export async function listPurchasesBySupplier(
  actor: AuthUser | null,
  supplierId: string,
): Promise<PurchaseDto[]> {
  requirePermission(actor, "purchases.read");
  await dbConnect();
  const items = await PurchaseModel.find({ supplier: supplierId })
    .sort({ createdAt: -1 })
    .lean();
  return items.map((p) => toPurchaseDto(p));
}

/** Counts purchases per supplier (used by supplier list). */
export async function countPurchasesBySuppliers(
  supplierIds: string[],
): Promise<Map<string, number>> {
  await dbConnect();
  const rows = await PurchaseModel.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { supplier: { $in: supplierIds } } },
    { $group: { _id: "$supplier", count: { $sum: 1 } } },
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r._id.toString(), r.count);
  return map;
}
