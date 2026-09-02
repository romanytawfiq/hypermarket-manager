import mongoose from "mongoose";
import { AppError, resolveError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission, requireAuth } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { ProductModel } from "@/models/product";
import { CategoryModel } from "@/models/category";
import { InventoryStateModel } from "@/models/inventory-state";
import { ProductBatchModel } from "@/models/product-batch";
import {
  OnlineOrderModel,
  TERMINAL_ONLINE_STATUSES,
  type OnlineOrder,
  type OnlineOrderStatus,
  type OnlineOrderDocument,
  type OnlinePaymentState,
  type OnlineOrderPaymentMethod,
} from "@/models/online-order";
import {
  InventoryReservationModel,
  type ReservationStatus,
} from "@/models/inventory-reservation";
import { nextSequenceValue } from "@/models/sequence";
import { createSaleWithSession } from "@/services/sales.service";
import {
  createPaymentSession,
  isKashierConfigured,
  KashierGatewayError,
} from "@/lib/kashier";
import type {
  OnlineCheckoutInput,
  OnlineTransitionInput,
  OnlineAssignInput,
} from "@/lib/validations/online-store";
import { getSellableStock } from "@/services/inventory.service";
import { env } from "@/lib/env";

/**
 * Online store & delivery service (Phase 9).
 *
 * The public storefront reuses the shared product/catalog domain; it never
 * duplicates product data (BR-046/BR-047). Availability respects internal
 * inventory rules and is computed as:
 *
 *   available = currentSellable - sum(active RESERVED reservations)  (>= 0)
 *
 * Checkout holds inventory via reservations and creates the OnlineOrder atomically.
 * COD is the only payment method: the order stays PAYMENT_PENDING until a delivery
 * employee collects cash at delivery, at which point a Sale + CASH payment is posted
 * (shift-bound, via createSaleWithSession) and the reservations are marked FULFILLED —
 * all in one transaction. The server is the source of truth for every price, total,
 * stock, and state (BR-001).
 */

const ORDER_PREFIX = "ON";
const RESERVATION_TTL_MS = 60 * 60 * 1000; // 1h hold on an abandoned reserved checkout

/**
 * Delivery-scoped assignment enforcement.
 *
 * A DELIVERY-role employee (one who holds `delivery.orders.update` but NOT
 * `online.orders.manage`) can only operate fulfillment actions
 * (`transitionOnlineOrder` delivery step, `collectCodAndDeliver`,
 * `deliverPaidOnlineOrder`) on orders explicitly assigned to them, or on an
 * unassigned READY_FOR_DELIVERY order they are dispatching. The UI scopes a
 * delivery employee's list to assigned/ready orders, but that listing scope is
 * NOT a security boundary — this check re-enforces assignment server-side so a
 * delivery employee cannot act on an arbitrary order id they were never
 * assigned (`delivery` authorization scope; see docs/architecture.md §18).
 *
 * Managers/owners (holders of `online.orders.manage`) manage every order and
 * are exempt from this restriction.
 */
function assertDeliveryAssignment(
  actor: AuthUser,
  order: Pick<OnlineOrderDocument, "status" | "assignedTo">,
): void {
  const isFulfillmentManager = actor.permissions.has("online.orders.manage");
  if (isFulfillmentManager) return;
  if (!actor.permissions.has("delivery.orders.update")) return;

  const assignedToMe = order.assignedTo?.id === actor.id;
  const dispatchingUnassignedReady =
    order.status === "READY_FOR_DELIVERY" && !order.assignedTo;
  if (assignedToMe || dispatchingUnassignedReady) return;

  throw new AppError(
    "FORBIDDEN",
    "لا يمكنك تنفيذ هذا الإجراء على طلب غير مخصص لك",
  );
}

/**
 * Opportunistic reservation cleanup: transitions any `RESERVED` reservation
 * whose `expiresAt` has passed to `EXPIRED`.
 *
 * There is deliberately NO TTL index on reservations and NO background
 * scheduler. Expired holds must not be physically deleted (they are audit
 * history for the online order), but they should be moved to a terminal state
 * so the collection does not grow unboundedly and queries that filter on
 * `status: "RESERVED"` never mutate stale rows. This is an online-order cleanup
 * invoked at checkout — the moment reservation pressure is at its highest in
 * the normal operating model — and is a small, bounded `updateMany` that only
 * touches rows that are already inactive by the read-time rule
 * (`RESERVED && expiresAt > now`). Never touches active reservations.
 */
async function expireStaleReservations(): Promise<void> {
  try {
    await InventoryReservationModel.updateMany(
      { status: "RESERVED" as ReservationStatus, expiresAt: { $lte: new Date() } },
      { $set: { status: "EXPIRED" as ReservationStatus } },
    );
  } catch (error) {
    // Cleanup is best-effort and must never block a real checkout. Log without
    // leaking internals.
    console.error("[online-store] reservation cleanup failed", resolveError(error));
  }
}

export interface OnlineOrderDto {
  id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  deliveryAddress: Record<string, unknown>;
  items: Array<{
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    reservedQuantity: number;
  }>;
  totalAmount: number;
  deliveryFee: number;
  payableAmount: number;
  status: OnlineOrderStatus;
  paymentState: OnlinePaymentState;
  paymentMethod: OnlineOrderPaymentMethod;
  paymentCollected: boolean;
  saleId: string | null;
  invoiceNumber: string;
  codCollectedAt: string | null;
  onlinePayment: {
    sessionId: string;
    paymentToken: string;
    initiatedAt: string;
    transactionId: string;
    status: string;
    paidAt: string;
  } | null;
  assignedTo: { id: string; username: string } | null;
  statusHistory: Array<{ status: OnlineOrderStatus; at: string; by: string }>;
  createdAt: string;
}

function toOnlineOrderDto(o: OnlineOrderDocument): OnlineOrderDto {
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    customerEmail: o.customerEmail ?? "",
    customerPhone: o.customerPhone,
    deliveryAddress: (o.deliveryAddress as unknown as Record<string, unknown>) ?? {},
    items: (o.items ?? []).map((i) => ({
      productId: i.productId.toString(),
      productName: i.productName,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      reservedQuantity: i.reservedQuantity,
    })),
    totalAmount: o.totalAmount,
    deliveryFee: o.deliveryFee ?? 0,
    payableAmount: o.payableAmount,
    status: o.status,
    paymentState: o.paymentState,
    paymentMethod: o.paymentMethod ?? "COD",
    paymentCollected: o.paymentCollected ?? false,
    saleId: o.saleId ?? null,
    invoiceNumber: o.invoiceNumber ?? "",
    codCollectedAt: o.codCollectedAt ? o.codCollectedAt.toISOString() : null,
    onlinePayment: o.onlinePayment
      ? {
          sessionId: o.onlinePayment.sessionId ?? "",
          paymentToken: o.onlinePayment.paymentToken ?? "",
          initiatedAt: o.onlinePayment.initiatedAt
            ? o.onlinePayment.initiatedAt.toISOString()
            : "",
          transactionId: o.onlinePayment.transactionId ?? "",
          status: o.onlinePayment.status ?? "",
          paidAt: o.onlinePayment.paidAt ? o.onlinePayment.paidAt.toISOString() : "",
        }
      : null,
    assignedTo: o.assignedTo && o.assignedTo.id ? o.assignedTo : null,
    statusHistory: (o.statusHistory ?? []).map((h) => ({
      status: h.status,
      at: h.at.toISOString(),
      by: h.by?.username ?? "",
    })),
    createdAt: o.createdAt ? new Date(o.createdAt as unknown as Date).toISOString() : "",
  };
}

function assertValidId(id: string, message: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("NOT_FOUND", message);
  }
}

/* ---------------------------------------------------------------- *
 * Public catalog (no auth required)                                 *
 * ---------------------------------------------------------------- */

export interface OnlineProductDto {
  id: string;
  name: string;
  description: string;
  sellingPrice: number;
  unit: string;
  categoryName: string;
  /** Brand name (empty string when the product has no brand). */
  brandName: string;
  /** Brand logo data-URI (empty string when absent). */
  brandLogo: string;
  available: number;
  inStock: boolean;
}

/* Active reservations summed per product (available-stock computation). */
async function activeReservedMap(productIds: string[]): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const now = new Date();
  const rows = await InventoryReservationModel.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        product: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: "RESERVED",
        expiresAt: { $gt: now },
      },
    },
    { $group: { _id: "$product", total: { $sum: "$quantity" } } },
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r._id.toString(), r.total ?? 0);
  return map;
}

async function loadSellableMap(ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const oids = ids.map((id) => new mongoose.Types.ObjectId(id));
  const meta = await ProductModel.find({ _id: { $in: oids } })
    .select("trackExpiry")
    .lean<Array<{ _id: mongoose.Types.ObjectId; trackExpiry: boolean }>>();
  const tracked = new Set(meta.filter((m) => m.trackExpiry).map((m) => m._id.toString()));

  const states = await InventoryStateModel.find({ product: { $in: oids } })
    .select("product onHand")
    .lean<Array<{ product: mongoose.Types.ObjectId; onHand: number }>>();
  const map = new Map<string, number>();
  for (const s of states) {
    if (!tracked.has(s.product.toString())) map.set(s.product.toString(), s.onHand ?? 0);
  }

  const now = new Date();
  const batchRows = await ProductBatchModel.aggregate<{ _id: string; total: number }>([
    {
      $match: {
        product: { $in: oids },
        quantity: { $gt: 0 },
        expiryDate: { $gt: now },
      },
    },
    { $group: { _id: "$product", total: { $sum: "$quantity" } } },
  ]);
  for (const r of batchRows) map.set(r._id.toString(), r.total ?? 0);
  return map;
}

async function buildOnlineProductDtos(
  products: Array<{
    _id: mongoose.Types.ObjectId;
    name: string;
    description: string;
    sellingPrice: number;
    unit: string;
    categoryName: string;
    brandName: string;
    brandLogo: string;
  }>,
): Promise<OnlineProductDto[]> {
  if (products.length === 0) return [];
  const ids = products.map((p) => p._id.toString());
  const [sellableMap, reservedMap] = await Promise.all([
    loadSellableMap(ids),
    activeReservedMap(ids),
  ]);
  return products.map((p) => {
    const available = Math.max(
      0,
      (sellableMap.get(p._id.toString()) ?? 0) - (reservedMap.get(p._id.toString()) ?? 0),
    );
    return {
      id: p._id.toString(),
      name: p.name,
      description: p.description,
      sellingPrice: p.sellingPrice,
      unit: p.unit,
      categoryName: p.categoryName,
      brandName: p.brandName,
      brandLogo: p.brandLogo,
      available,
      inStock: available > 0,
    };
  });
}

/**
 * Lists online-visible, active products with live available stock. Public
 * (no session): the storefront must be indexable and reachable without login.
 */
export async function listOnlineProducts(): Promise<OnlineProductDto[]> {
  await dbConnect();
  const products = await ProductModel.find({ onlineVisible: true, active: true })
    .populate("category", "name")
    .populate("brand", "name logo")
    .sort({ name: 1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        description?: string;
        sellingPrice: number;
        unit: string;
        category?: { name: string } | null;
        brand?: { name: string; logo?: string } | null;
      }>
    >();
  const mapped = products.map((p) => ({
    _id: p._id,
    name: p.name,
    description: p.description ?? "",
    sellingPrice: p.sellingPrice,
    unit: p.unit,
    categoryName: p.category?.name ?? "",
    brandName: p.brand?.name ?? "",
    brandLogo: p.brand?.logo ?? "",
  }));
  return buildOnlineProductDtos(mapped);
}

/* ---------------------------------------------------------------- *
 * Public catalog: server-side search / filter / pagination (Phase 9.2)
 * ---------------------------------------------------------------- */

export const ONLINE_PAGE_SIZE_DEFAULT = 24;
export const ONLINE_PAGE_SIZE_MAX = 48;
export const ONLINE_PAGE_MAX = 1000;

/** Search/filter/pagination params for the public catalog (all optional). */
export interface OnlineCatalogQuery {
  /** Free-text search on the product name. */
  search?: string;
  /** Filter to products in this category (category id). */
  categoryId?: string;
  /** 1-based page. */
  page?: number;
  /** Items per page (clamped to a bounded maximum). */
  pageSize?: number;
}

export interface OnlineCatalogResult {
  items: OnlineProductDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** A category available for online browsing (has at least one online product). */
export interface OnlineCategoryDto {
  id: string;
  name: string;
}

/** Escapes user input so it is treated as a literal regex, never a pattern. */
function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Server-side, bounded catalog query. This is the single public listing function
 * for the storefront: it never loads the whole catalog into the browser. Instead
 * the server filters by search/category, counts, and returns one page of items
 * plus the live availability only for that page (architecture §9 — server is
 * authoritative). `REQ-PERF-002`/`REQ-PERF-004`.
 */
export async function searchOnlineProducts(
  query: OnlineCatalogQuery = {},
): Promise<OnlineCatalogResult> {
  await dbConnect();

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(
    ONLINE_PAGE_SIZE_MAX,
    Math.max(1, Math.floor(query.pageSize ?? ONLINE_PAGE_SIZE_DEFAULT)),
  );

  const filter: Record<string, unknown> = { onlineVisible: true, active: true };

  if (query.categoryId && mongoose.isValidObjectId(query.categoryId)) {
    filter.category = new mongoose.Types.ObjectId(query.categoryId);
  }

  // Full-text search on product name. The regex is anchored to the start of the
  // name to remain prefix-friendly for the {onlineVisible,active,category,name}
  // index; leading-wildcard scans are avoided (D4 audit note) now that results
  // are page-bounded.
  let nameRegex: RegExp | undefined;
  if (query.search && query.search.trim().length > 0) {
    nameRegex = new RegExp(`^${escapeRegex(query.search.trim())}`, "i");
    filter.name = nameRegex;
  }

  const total = await ProductModel.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = Math.max(0, (safePage - 1) * pageSize);

  const products = await ProductModel.find(filter)
    .populate("category", "name")
    .populate("brand", "name logo")
    .sort({ name: 1 })
    .skip(skip)
    .limit(pageSize)
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        description?: string;
        sellingPrice: number;
        unit: string;
        category?: { name: string } | null;
        brand?: { name: string; logo?: string } | null;
      }>
    >();

  const mapped = products.map((p) => ({
    _id: p._id,
    name: p.name,
    description: p.description ?? "",
    sellingPrice: p.sellingPrice,
    unit: p.unit,
    categoryName: p.category?.name ?? "",
    brandName: p.brand?.name ?? "",
    brandLogo: p.brand?.logo ?? "",
  }));

  return {
    items: await buildOnlineProductDtos(mapped),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/**
 * Online-browsable categories (only categories that contain at least one
 * online-visible, active product), sorted by name. Used by the storefront filter.
 */
export async function getOnlineCategories(): Promise<OnlineCategoryDto[]> {
  await dbConnect();
  const catIds = await ProductModel.distinct("category", {
    onlineVisible: true,
    active: true,
  });
  const cats = await CategoryModel.find({
    _id: { $in: catIds },
    active: true,
  })
    .select("name")
    .sort({ name: 1 })
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  return cats.map((c) => ({ id: c._id.toString(), name: c.name }));
}

/**
 * Fetches a single online-visible product with live available stock. Public.
 * Returns null (not found) for hidden/inactive/non-online products to avoid
 * leaking internal catalog data.
 */
export async function getOnlineProduct(id: string): Promise<OnlineProductDto | null> {
  await dbConnect();
  if (!mongoose.isValidObjectId(id)) return null;
  const p = await ProductModel.findById(id)
    .populate("category", "name")
    .populate("brand", "name logo")
    .lean<{
      _id: mongoose.Types.ObjectId;
      name: string;
      description?: string;
      sellingPrice: number;
      unit: string;
      trackExpiry: boolean;
      onlineVisible: boolean;
      active: boolean;
      category?: { name: string } | null;
      brand?: { name: string; logo?: string } | null;
    }>();
  if (!p || !p.onlineVisible || !p.active) return null;
  const sellableMap = await loadSellableMap([id]);
  const reservedMap = await activeReservedMap([id]);
  const available = Math.max(0, (sellableMap.get(id) ?? 0) - (reservedMap.get(id) ?? 0));
  return {
    id: p._id.toString(),
    name: p.name,
    description: p.description ?? "",
    sellingPrice: p.sellingPrice,
    unit: p.unit,
    categoryName: p.category?.name ?? "",
    brandName: p.brand?.name ?? "",
    brandLogo: p.brand?.logo ?? "",
    available,
    inStock: available > 0,
  };
}

/* ---------------------------------------------------------------- *
 * Checkout                                                          *
 * ---------------------------------------------------------------- */

export interface CheckoutLine {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

/** Constant delivery fee in EGP. Configurable; 0 in this phase. */
export const DELIVERY_FEE = 0;

/**
 * Creates an online order and reserves inventory, atomically.
 *
 * The server recomputes every price and total from the authoritative catalog.
 * Availability is validated against live sellable stock MINUS active
 * reservations, so two concurrent checkouts cannot claim the same last unit
 * (architecture §17). A single MongoDB transaction creates the order + one
 * InventoryReservation per unique product + the audit trail; on any validation
 * failure nothing is persisted (architecture §9 / §48).
 */
export interface CheckoutResult {
  order: OnlineOrderDto;
  /** Per-order tracking secret returned once at checkout (not exposed elsewhere). */
  trackingToken: string;
  /**
   * When the customer chose online (Kashier) payment, the hosted payment page URL
   * to which the browser must be redirected. Absent for COD.
   */
  paymentSessionUrl?: string;
  /** Kashier session id persisted on the order (pending payment reference). */
  paymentSessionId?: string;
}

export async function createOnlineOrder(
  input: OnlineCheckoutInput,
): Promise<CheckoutResult> {
  await dbConnect();

  // Opportunistically expire stale reservation holds before computing
  // availability, so checkout never blocks against an abandoned reservation and
  // the reservation collection does not accumulate active-looking RESERVED rows
  // that are logically expired (see expireStaleReservations).
  await expireStaleReservations();

  const paymentMethod: OnlineOrderPaymentMethod =
    input.paymentMethod === "ONLINE" ? "ONLINE" : "COD";

  // Online payment is only available when the gateway is configured. Failing
  // fast here prevents creating an order that cannot be paid online (the safe,
  // configurable default keeps the store COD-only until the merchant provides
  // Kashier credentials).
  if (paymentMethod === "ONLINE" && !isKashierConfigured()) {
    throw new AppError(
      "CONFLICT",
      "الدفع الإلكتروني غير متاح حاليًا. استخدم الدفع عند الاستلام أو تواصل مع المتجر",
    );
  }

  const qtyByProduct = new Map<string, number>();
  for (const line of input.items) {
    qtyByProduct.set(
      line.productId,
      (qtyByProduct.get(line.productId) ?? 0) + line.quantity,
    );
  }

  const committed = await withTransaction(async (session) => {
    // Idempotency: replaying the same key returns the existing order + token.
    if (input.idempotencyKey) {
      const existing = await OnlineOrderModel.findOne({
        idempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .select("+trackingToken")
        .lean<OnlineOrderDocument>();
      if (existing) {
        return {
          order: toOnlineOrderDto(existing),
          trackingToken: existing.trackingToken,
        };
      }
    }

    // Server-derived, authoritative checkout lines (price snapshot).
    const lines: CheckoutLine[] = [];
    const availableMap = await computeAvailableMap(
      Array.from(qtyByProduct.keys()),
      session,
    );

    for (const line of input.items) {
      const product = await ProductModel.findById(line.productId)
        .session(session)
        .select("name sellingPrice unit active onlineVisible")
        .lean<{
          _id: mongoose.Types.ObjectId;
          name: string;
          sellingPrice: number;
          unit: string;
          active: boolean;
          onlineVisible: boolean;
        }>();
      if (!product) throw new AppError("NOT_FOUND", "أحد المنتجات غير موجود");
      if (!product.active) {
        throw new AppError("CONFLICT", `المنتج '${product.name}' غير متاح`);
      }
      if (!product.onlineVisible) {
        throw new AppError("CONFLICT", `المنتج '${product.name}' غير متاح عبر المتجر`);
      }

      const demanded = qtyByProduct.get(line.productId) ?? line.quantity;
      const available = availableMap.get(line.productId) ?? 0;
      if (available < demanded) {
        throw new AppError(
          "CONFLICT",
          `لا يوجد مخزون كافٍ من '${product.name}'. المتاح: ${available} ${product.unit}`,
        );
      }

      const unitPrice = Math.round(product.sellingPrice * 100) / 100;
      const lineTotal = Math.round(unitPrice * line.quantity * 100) / 100;
      lines.push({
        productId: product._id.toString(),
        productName: product.name,
        unitPrice,
        quantity: line.quantity,
        lineTotal,
      });
    }

    const totalAmount =
      Math.round(lines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const payableAmount = Math.round((totalAmount + DELIVERY_FEE) * 100) / 100;

    // Concurrency-safe order number.
    const now = new Date();
    const dayKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const seq = await nextSequenceValue(`online-order-${dayKey}`, session);
    const orderNumber = `${ORDER_PREFIX}-${dayKey}-${String(seq).padStart(4, "0")}`;
    const trackingToken = crypto.randomUUID();

    const [order] = await OnlineOrderModel.create(
      [
        {
          orderNumber,
          customerName: input.customerName.trim(),
          customerEmail: input.customerEmail?.trim() || "",
          customerPhone: input.customerPhone.trim(),
          deliveryAddress: input.deliveryAddress,
          items: lines.map((l) => ({
            productId: new mongoose.Types.ObjectId(l.productId),
            productName: l.productName,
            unitPrice: l.unitPrice,
            quantity: l.quantity,
            lineTotal: l.lineTotal,
            reservedQuantity: l.quantity,
          })),
          totalAmount,
          deliveryFee: DELIVERY_FEE,
          payableAmount,
          status: "PENDING",
          paymentState: "PAYMENT_PENDING",
          paymentMethod,
          paymentCollected: false,
          trackingToken,
          version: 0,
          statusHistory: [
            { status: "PENDING" as OnlineOrderStatus, at: new Date(), by: undefined },
          ],
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session },
    );
    if (!order) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء حفظ الطلب");

    // Reserve inventory: one Reservation per unique product with a TTL.
    const perProductQty = new Map<string, number>();
    for (const l of lines) {
      perProductQty.set(l.productId, (perProductQty.get(l.productId) ?? 0) + l.quantity);
    }
    await InventoryReservationModel.create(
      Array.from(perProductQty.entries()).map(([productId, quantity]) => ({
        product: new mongoose.Types.ObjectId(productId),
        onlineOrder: order._id,
        orderNumber,
        quantity,
        status: "RESERVED" as ReservationStatus,
        reservationKey: trackingToken,
        reservedAt: new Date(),
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      })),
      { session },
    );

    await recordAudit({
      actorId: null,
      actorUsername: null,
      action: "online.order.created",
      entity: "online_order",
      entityId: order._id.toString(),
      after: { orderNumber, trackingToken, payableAmount, itemCount: lines.length },
    });

    const doc = await OnlineOrderModel.findById(order._id)
      .session(session)
      .lean<OnlineOrderDocument>();
    if (!doc) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء حفظ الطلب");
    return { order: toOnlineOrderDto(doc), trackingToken };
  });

  // Online payment: create the Kashier session AFTER the order commits, so we
  // never hold the DB transaction open during an external HTTP call. The session
  // is not a payment — the authoritative capture is confirmed by the webhook.
  // We persist the session reference (id + token + time) so a pending payment
  // reference survives a redirect / refresh, and so the redirect-return page can
  // reconcile it without trusting a client-supplied value.
  if (paymentMethod === "ONLINE") {
    const session = await createOnlinePaymentSession(committed.order, input);
    if (session) {
      return {
        ...committed,
        order: session.order,
        paymentSessionUrl: session.sessionUrl,
        paymentSessionId: session.sessionId,
      };
    }
  }

  return committed;
}

/**
 * Creates a Kashier Payment Session for an already-persisted ONLINE order,
 * persists the pending payment reference (session id + opaque token) on the
 * order, and returns the hosted payment page URL. The browser is redirected
 * there; the authoritative payment confirmation arrives via the Kashier server
 * webhook.
 */
async function createOnlinePaymentSession(
  order: OnlineOrderDto,
  input: OnlineCheckoutInput,
): Promise<{ sessionUrl: string; sessionId: string; order: OnlineOrderDto } | null> {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  let session: Awaited<ReturnType<typeof createPaymentSession>>;

  try {
    session = await createPaymentSession({
      orderReference: order.orderNumber,
      amount: order.payableAmount,
      currency: "EGP",
      customer: {
        name: input.customerName,
        email: input.customerEmail,
        phone: input.customerPhone,
      },
      description: `طلب متجر ${order.orderNumber}`,
      merchantRedirectUrl: `${appUrl}/store/payment/return`,
      serverWebhook: `${appUrl}/api/payments/kashier-webhook`,
    });
  } catch (error) {
    if (error instanceof KashierGatewayError) {
      throw new AppError("INTERNAL", "تعذّر الاتصال ببوابة الدفع. حاول مرة أخرى");
    }
    throw error;
  }
  if (!session.sessionUrl) {
    throw new AppError("INTERNAL", "تعذّر إنشاء جلسة الدفع الإلكتروني. حاول مرة أخرى");
  }

  // Persist the pending payment reference so it survives a redirect / refresh
  // and is never forged by the client. The order stays PAYMENT_PENDING until the
  // signature-verified webhook marks it captured.
  if (session.sessionId) {
    const now = new Date();
    const paymentToken =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    await OnlineOrderModel.updateOne(
      { _id: order.id },
      {
        $set: {
          "onlinePayment.sessionId": session.sessionId,
          "onlinePayment.paymentToken": paymentToken,
          "onlinePayment.initiatedAt": now,
        },
      },
    );
  }

  // Re-read the order so the returned DTO carries the pending payment reference.
  const fresh = await OnlineOrderModel.findById(order.id).lean<OnlineOrderDocument>();
  const freshDto = fresh ? toOnlineOrderDto(fresh) : order;

  return {
    sessionUrl: session.sessionUrl,
    sessionId: session.sessionId,
    order: freshDto,
  };
}

/** Computes per-product available stock (sellable minus active reservations). */
async function computeAvailableMap(
  productIds: string[],
  session?: mongoose.ClientSession,
): Promise<Map<string, number>> {
  const sellableMap = new Map<string, number>();
  for (const id of productIds) {
    const stock = await getSellableStock(id);
    sellableMap.set(id, stock.sellable);
  }
  const reservedMap = await activeReservedWithinSession(productIds, session);
  const map = new Map<string, number>();
  for (const id of productIds) {
    map.set(id, Math.max(0, (sellableMap.get(id) ?? 0) - (reservedMap.get(id) ?? 0)));
  }
  return map;
}

async function activeReservedWithinSession(
  productIds: string[],
  session?: mongoose.ClientSession,
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const now = new Date();
  const rows = await InventoryReservationModel.aggregate<{ _id: string; total: number }>(
    [
      {
        $match: {
          product: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) },
          status: "RESERVED",
          expiresAt: { $gt: now },
        },
      },
      { $group: { _id: "$product", total: { $sum: "$quantity" } } },
    ],
    { session },
  );
  const m = new Map<string, number>();
  for (const r of rows) m.set(r._id.toString(), r.total ?? 0);
  return m;
}

/* ---------------------------------------------------------------- *
 * Guest tracking (public read-only)                                 *
 * ---------------------------------------------------------------- */

/**
 * Public order tracking by order number + token. The token is a per-order
 * secret returned only at checkout, so a guest can view their own order without
 * a login and without exposing other customers' orders (no IDOR).
 */
export async function trackOnlineOrder(
  orderNumber: string,
  trackingToken: string,
): Promise<OnlineOrderDto> {
  await dbConnect();
  const order = await OnlineOrderModel.findOne({
    orderNumber,
    trackingToken,
  }).lean<OnlineOrderDocument>();
  if (!order)
    throw new AppError("NOT_FOUND", "الطلب غير موجود. تحقق من رقم الطلب ورمز التتبع");
  return toOnlineOrderDto(order);
}

/* ---------------------------------------------------------------- *
 * Admin management                                                   *
 * ---------------------------------------------------------------- */

/** Lists online orders (newest first). Requires `online.orders.read`. */
export async function listOnlineOrders(
  actor: AuthUser | null,
  opts: { status?: string; limit?: number } = {},
): Promise<OnlineOrderDto[]> {
  requirePermission(actor, "online.orders.read");
  await dbConnect();
  const filter: Record<string, unknown> = {};
  if (opts.status) filter.status = opts.status;
  const rows = await OnlineOrderModel.find(filter)
    .sort({ createdAt: -1 })
    .limit(opts.limit ?? 200)
    .lean<OnlineOrderDocument[]>();
  return rows.map(toOnlineOrderDto);
}

export const ONLINE_ORDERS_PAGE_DEFAULT = 20;
export const ONLINE_ORDERS_PAGE_MAX = 100;

/**
 * Filter/pagination params for the admin Online Orders dashboard.
 * Filtering and pagination run server-side so the browser never loads the full
 * order set. All filtering is a UX convenience — authorization is enforced here.
 */
export interface OnlineOrdersQuery {
  page?: number;
  pageSize?: number;
  /** Exact order status (optional). */
  status?: OnlineOrderStatus;
  /** Exact payment state (optional). */
  paymentState?: OnlinePaymentState;
  /** Exact payment method (optional). */
  paymentMethod?: OnlineOrderPaymentMethod;
  /** Only orders created on/after this ISO date-time. */
  from?: string;
  /** Only orders created on/before this ISO date-time. */
  to?: string;
  /** Free-text across order number, customer name, or customer phone. */
  search?: string;
}

export interface OnlineOrdersPageResult {
  items: OnlineOrderDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Paginated, server-filtered listing for the admin dashboard. Requires
 * `online.orders.read`. Never loads more than `ONLINE_ORDERS_PAGE_MAX` rows.
 */
export async function listOnlineOrdersPage(
  actor: AuthUser | null,
  query: OnlineOrdersQuery = {},
): Promise<OnlineOrdersPageResult> {
  requirePermission(actor, "online.orders.read");
  await dbConnect();

  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pageSize = Math.min(
    ONLINE_ORDERS_PAGE_MAX,
    Math.max(1, Math.floor(query.pageSize ?? ONLINE_ORDERS_PAGE_DEFAULT)),
  );

  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.paymentState) filter.paymentState = query.paymentState;
  if (query.paymentMethod) filter.paymentMethod = query.paymentMethod;

  if (query.from) {
    const from = new Date(query.from);
    if (!Number.isNaN(from.getTime()))
      filter.createdAt = { ...(filter.createdAt ?? {}), $gte: from };
  }
  if (query.to) {
    const to = new Date(query.to);
    if (!Number.isNaN(to.getTime()))
      filter.createdAt = { ...(filter.createdAt ?? {}), $lte: to };
  }

  if (query.search && query.search.trim().length > 0) {
    const q = escapeRegex(query.search.trim());
    const re = new RegExp(q, "i");
    (filter as Record<string, unknown>).$or = [
      { orderNumber: re },
      { customerName: re },
      { customerPhone: re },
    ];
  }

  const total = await OnlineOrderModel.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const skip = Math.max(0, (safePage - 1) * pageSize);

  const rows = await OnlineOrderModel.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .lean<OnlineOrderDocument[]>();

  return {
    items: rows.map(toOnlineOrderDto),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/** Fetches a single online order. Requires `online.orders.read`. */
export async function getOnlineOrder(
  actor: AuthUser | null,
  id: string,
): Promise<OnlineOrderDto> {
  requirePermission(actor, "online.orders.read");
  await dbConnect();
  assertValidId(id, "الطلب غير موجود");
  const order = await OnlineOrderModel.findById(id).lean<OnlineOrderDocument>();
  if (!order) throw new AppError("NOT_FOUND", "الطلب غير موجود");
  return toOnlineOrderDto(order);
}

const ALLOWED_NEXT: Record<string, readonly string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_DELIVERY: ["OUT_FOR_DELIVERY", "CANCELLED"],
  // OUT_FOR_DELIVERY is intentionally NOT given a generic -> DELIVERED transition.
  // Reaching DELIVERED must post the financial Sale, so the only valid paths are
  // `collectCodAndDeliver` (COD) and `deliverPaidOnlineOrder` (ONLINE), which both
  // record the Sale + fulfill inventory reservations in one transaction. Allowing a
  // bare DELIVERED here would let an operator mark an order delivered (and terminal)
  // while the money is never recorded and reservations are never fulfilled.
  OUT_FOR_DELIVERY: ["CANCELLED"],
};

/**
 * Statuses a DELIVERY-role employee may set (target values). A delivery person
 * can dispatch an order (READY_FOR_DELIVERY → OUT_FOR_DELIVERY); the final
 * OUT_FOR_DELIVERY → DELIVERED requires `online.orders.manage` OR must go
 * through `collectCodAndDeliver` (which posts the COD Sale and delivers). This
 * prevents a delivery employee from marking an order delivered while skipping
 * the financial collection (COD is the only payment method for online orders).
 */
const DELIVERY_TARGETS: readonly string[] = ["OUT_FOR_DELIVERY"];

/**
 * The single authoritative online-order transition entry point, with optimistic
 * concurrency (version-guarded findOneAndUpdate) and a validated state machine.
 * Cancelling an active order releases its inventory reservations.
 *
 * Authorization: the full admin ladder (PENDING→…→READY_FOR_DELIVERY) requires
 * `online.orders.manage`; the delivery steps (READY_FOR_DELIVERY →
 * OUT_FOR_DELIVERY → DELIVERED) additionally allow `delivery.orders.update`
 * holders (DELIVERY-role employees) so a delivery person can fulfill their own
 * shipments without manager privileges. `DELIVERED` here is the non-financial
 * path; financial fulfillment happens via `collectCodAndDeliver`.
 */
export async function transitionOnlineOrder(
  actor: AuthUser | null,
  input: OnlineTransitionInput,
): Promise<OnlineOrderDto> {
  await dbConnect();
  assertValidId(input.orderId, "الطلب غير موجود");

  // Determine authorization before reading state: delivery-dispatch targets
  // require `delivery.orders.update`, every other transition requires the admin
  // `online.orders.manage` permission.
  const isDeliveryStep = DELIVERY_TARGETS.includes(input.targetStatus);
  if (isDeliveryStep) {
    requirePermission(actor, "delivery.orders.update");
  } else {
    requirePermission(actor, "online.orders.manage");
  }

  return withTransaction(async (session) => {
    const order = await OnlineOrderModel.findById(input.orderId)
      .session(session)
      .lean<OnlineOrderDocument>();
    if (!order) throw new AppError("NOT_FOUND", "الطلب غير موجود");
    if (TERMINAL_ONLINE_STATUSES.includes(order.status)) {
      throw new AppError("CONFLICT", "لا يمكن تغيير حالة طلب منتهي");
    }
    const allowed = ALLOWED_NEXT[order.status] ?? [];
    if (!allowed.includes(input.targetStatus)) {
      throw new AppError("CONFLICT", "حالة غير مسموح بها لهذا الطلب حاليًا");
    }
    // Delivery-scoped assignment enforcement: a delivery-only employee may only
    // operate on orders assigned to them (or dispatch an unassigned ready one).
    const authed = requireAuth(actor);
    assertDeliveryAssignment(authed, order);

    const now = new Date();
    const res = await OnlineOrderModel.findOneAndUpdate(
      { _id: order._id, version: order.version },
      {
        $set: {
          status: input.targetStatus,
          version: order.version + 1,
          ...(input.targetStatus === "CANCELLED" ? { cancelledAt: now } : {}),
          ...(input.targetStatus === "DELIVERED" ? { deliveredAt: now } : {}),
        },
        $push: {
          statusHistory: {
            status: input.targetStatus,
            at: now,
            by: { id: actor?.id, username: actor?.username },
          },
        },
      },
      { returnDocument: "after", session },
    ).lean<OnlineOrderDocument>();

    if (!res) {
      throw new AppError("CONFLICT", "تعذّر تحديث الطلب لأن حالته تغيّرت. حاول مرة أخرى");
    }

    // Releasing inventory reservations on cancellation.
    if (input.targetStatus === "CANCELLED") {
      await InventoryReservationModel.updateMany(
        { onlineOrder: order._id, status: "RESERVED" },
        { $set: { status: "RELEASED" as ReservationStatus, releasedAt: now } },
        { session },
      );
    }

    await recordAudit({
      actorId: actor?.id,
      actorUsername: actor?.username,
      action: "online.order.transition",
      entity: "online_order",
      entityId: order._id.toString(),
      before: { status: order.status },
      after: { status: input.targetStatus, orderNumber: order.orderNumber },
    });

    return toOnlineOrderDto(res);
  });
}

/** Assigns a delivery employee to an order. Requires `online.orders.manage`. */
export async function assignOnlineOrder(
  actor: AuthUser | null,
  input: OnlineAssignInput,
): Promise<OnlineOrderDto> {
  requirePermission(actor, "online.orders.manage");
  await dbConnect();
  assertValidId(input.orderId, "الطلب غير موجود");

  const assignedTo =
    input.employeeId && input.employeeUsername
      ? { id: input.employeeId, username: input.employeeUsername }
      : undefined;

  const order = await OnlineOrderModel.findById(input.orderId).lean<OnlineOrderDocument>();
  if (!order) throw new AppError("NOT_FOUND", "الطلب غير موجود");
  if (TERMINAL_ONLINE_STATUSES.includes(order.status)) {
    throw new AppError("CONFLICT", "لا يمكن تعديل تعيين طلب منتهي");
  }

  const updated = await OnlineOrderModel.findByIdAndUpdate(
    input.orderId,
    {
      $set: { assignedTo: assignedTo ?? null, version: order.version + 1 },
      $push: {
        statusHistory: {
          status: order.status,
          at: new Date(),
          by: { id: actor?.id, username: actor?.username },
        },
      },
    },
    { returnDocument: "after" },
  ).lean<OnlineOrderDocument>();
  if (!updated) throw new AppError("NOT_FOUND", "الطلب غير موجود");

  await recordAudit({
    actorId: actor?.id,
    actorUsername: actor?.username,
    action: "online.order.assigned",
    entity: "online_order",
    entityId: order._id.toString(),
    after: { assignedTo: assignedTo ?? null },
  });

  return toOnlineOrderDto(updated);
}

/**
 * Marks COD collected and delivers the order, posting the financial Sale.
 *
 * This is the financial integration point (architecture §17/§18): collecting
 * the cash means recording the real Sale so the money enters the collector's
 * OPEN cashier shift (createSaleWithSession). The order cannot be DELIVERED+paid
 * without a valid Sale; no fabricated payment success is ever recorded. Runs
 * in one transaction: Sale (+ payment + inventory) + order DELIVERED/PAID state
 * + reservations FULFILLED, all commit or roll back together.
 */
export async function collectCodAndDeliver(
  actor: AuthUser | null,
  orderId: string,
): Promise<OnlineOrderDto> {
  const authed = requireAuth(actor);
  const canManageOrder =
    authed.permissions.has("delivery.orders.update") ||
    authed.permissions.has("online.orders.manage");
  if (!canManageOrder || !authed.permissions.has("sales.create")) {
    throw new AppError("FORBIDDEN", "ليس لديك صلاحية لتنفيذ هذا الإجراء");
  }
  await dbConnect();
  assertValidId(orderId, "الطلب غير موجود");

  return withTransaction(async (session) => {
    const order = await OnlineOrderModel.findById(orderId)
      .session(session)
      .lean<OnlineOrderDocument>();
    if (!order) throw new AppError("NOT_FOUND", "الطلب غير موجود");
    if (order.paymentCollected) {
      throw new AppError("CONFLICT", "تم تحصيل هذا الطلب مسبقًا");
    }
    if (TERMINAL_ONLINE_STATUSES.includes(order.status)) {
      throw new AppError("CONFLICT", "لا يمكن تحصيل دفع لطلب منتهي");
    }
    if (order.status !== "OUT_FOR_DELIVERY") {
      throw new AppError(
        "CONFLICT",
        "يجب أن يكون الطلب خارجًا للتوصيل قبل تحصيل الدفع عند الاستلام",
      );
    }
    // Delivery-scoped assignment enforcement (see assertDeliveryAssignment).
    assertDeliveryAssignment(authed, order);

    // Build the authoritative SaleCreateInput from the order's snapshot lines.
    const sale = await createSaleWithSession(
      authed,
      {
        items: order.items.map((i) => ({
          productId: i.productId.toString(),
          quantity: i.quantity,
        })),
        // Full COD is collected in cash when delivered.
        payments: [{ method: "CASH", amount: order.payableAmount }],
        idempotencyKey: `cod-${order.orderNumber}-${order._id.toString()}`,
        customerName: order.customerName,
      },
      session,
    );

    if (!sale)
      throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء تسجيل الدفع عند الاستلام");

    const now = new Date();
    const saleId = (sale as unknown as { _id: { toString(): string } })._id.toString();
    const res = await OnlineOrderModel.findOneAndUpdate(
      { _id: order._id, version: order.version },
      {
        $set: {
          status: "DELIVERED",
          paymentState: "PAID_AT_DELIVERY" as OnlinePaymentState,
          paymentCollected: true,
          saleId,
          invoiceNumber: sale.invoiceNumber,
          codCollectedAt: now,
          deliveredAt: now,
          version: order.version + 1,
        },
        $push: {
          statusHistory: {
            status: "DELIVERED" as OnlineOrderStatus,
            at: now,
            by: { id: authed.id, username: authed.username },
            metadata: { cod: true, invoiceNumber: sale.invoiceNumber },
          },
        },
      },
      { returnDocument: "after", session },
    ).lean<OnlineOrderDocument>();

    if (!res) {
      throw new AppError("CONFLICT", "تعذّر تحديث الطلب لأن حالته تغيّرت. حاول مرة أخرى");
    }

    await InventoryReservationModel.updateMany(
      { onlineOrder: order._id, status: "RESERVED" },
      { $set: { status: "FULFILLED" as ReservationStatus, fulfilledAt: now } },
      { session },
    );

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "online.order.collected",
      entity: "online_order",
      entityId: order._id.toString(),
      after: { orderNumber: order.orderNumber, invoiceNumber: sale.invoiceNumber },
    });

    return toOnlineOrderDto(res);
  });
}

/* ---------------------------------------------------------------- *
 * Online (Kashier) payment                                          *
 * ---------------------------------------------------------------- */

/**
 * Records the authoritative capture of an online-paid order. Called ONLY from
 * the verified Kashier server webhook (no session actor). It never trusts a
 * redirect or any client value — the caller already verified the webhook
 * signature (`lib/kashier.ts`), so this flips the order to `PAID_ONLINE`. It is
 * idempotent: re-delivery of the same transaction is a no-op.
 */
export async function markOnlineOrderPaid(input: {
  orderNumber: string;
  amount: number;
  transactionId?: string;
  status?: string;
}): Promise<void> {
  await dbConnect();

  await withTransaction(async (session) => {
    const order = await OnlineOrderModel.findOne({ orderNumber: input.orderNumber })
      .session(session)
      .lean<OnlineOrderDocument>();
    if (!order) return; // unknown order — nothing to mark (webhook still 200'd)
    if (TERMINAL_ONLINE_STATUSES.includes(order.status)) return;
    if (order.paymentMethod !== "ONLINE") return;
    if (order.paymentState === "PAID_ONLINE" && order.paymentCollected) return;

    // Guard: the captured amount must match the order's payable amount.
    if (Math.abs((input.amount ?? 0) - order.payableAmount) > 0.001) {
      throw new AppError("CONFLICT", "قيمة الدفعة الإلكترونية لا تطابق قيمة الطلب");
    }

    const now = new Date();
    const res = await OnlineOrderModel.findOneAndUpdate(
      { _id: order._id, version: order.version },
      {
        $set: {
          paymentState: "PAID_ONLINE" as OnlinePaymentState,
          paymentCollected: true,
          onlinePayment: {
            transactionId: input.transactionId ?? "",
            status: input.status ?? "PAID",
            paidAt: now,
          },
          version: order.version + 1,
        },
        $push: {
          statusHistory: {
            status: order.status as OnlineOrderStatus,
            at: now,
            by: undefined,
            metadata: { onlinePayment: true },
          },
        },
      },
      { returnDocument: "after", session },
    ).lean<OnlineOrderDocument>();

    await recordAudit({
      actorId: null,
      actorUsername: null,
      action: "online.order.paid",
      entity: "online_order",
      entityId: order._id.toString(),
      after: {
        orderNumber: order.orderNumber,
        transactionId: input.transactionId ?? "",
      },
    });

    if (!res) {
      throw new AppError("CONFLICT", "تعذّر تحديث حالة الدفع. حاول مرة أخرى");
    }
  });
}

/**
 * Delivers a paid-online order, posting the financial Sale with a non-cash
 * ONLINE payment (mirrors `collectCodAndDeliver`). The money is already captured
 * by the gateway — the Sale records revenue into the Sale-based reporting and
 * consumes the reserved stock, all inside the collector's OPEN shift (non-cash,
 * so it never affects the till's expected cash).
 */
export async function deliverPaidOnlineOrder(
  actor: AuthUser | null,
  orderId: string,
): Promise<OnlineOrderDto> {
  const authed = requireAuth(actor);
  const canManageOrder =
    authed.permissions.has("delivery.orders.update") ||
    authed.permissions.has("online.orders.manage");
  if (!canManageOrder || !authed.permissions.has("sales.create")) {
    throw new AppError("FORBIDDEN", "ليس لديك صلاحية لتنفيذ هذا الإجراء");
  }
  await dbConnect();
  assertValidId(orderId, "الطلب غير موجود");

  return withTransaction(async (session) => {
    const order = await OnlineOrderModel.findById(orderId)
      .session(session)
      .lean<OnlineOrderDocument>();
    if (!order) throw new AppError("NOT_FOUND", "الطلب غير موجود");
    if (TERMINAL_ONLINE_STATUSES.includes(order.status)) {
      throw new AppError("CONFLICT", "لا يمكن تسليم طلب منتهي");
    }
    if (order.status !== "OUT_FOR_DELIVERY") {
      throw new AppError("CONFLICT", "يجب أن يكون الطلب خارجًا للتوصيل قبل تسليمه");
    }
    if (order.paymentMethod !== "ONLINE") {
      throw new AppError("CONFLICT", "هذا الطلب غير مدفوع إلكترونيًا");
    }
    if (order.paymentState !== "PAID_ONLINE" || !order.paymentCollected) {
      throw new AppError("CONFLICT", "لم يتم تأكيد الدفع الإلكتروني لهذا الطلب بعد");
    }
    if (order.saleId) {
      throw new AppError("CONFLICT", "تم تسليم هذا الطلب وتسجيل مبيعه مسبقًا");
    }
    // Delivery-scoped assignment enforcement (see assertDeliveryAssignment).
    assertDeliveryAssignment(authed, order);

    const sale = await createSaleWithSession(
      authed,
      {
        items: order.items.map((i) => ({
          productId: i.productId.toString(),
          quantity: i.quantity,
        })),
        // Non-cash ONLINE payment records the already-captured revenue.
        payments: [{ method: "ONLINE", amount: order.payableAmount }],
        idempotencyKey: `online-${order.orderNumber}-${order._id.toString()}`,
        customerName: order.customerName,
      },
      session,
    );

    if (!sale) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء تسجيل بيع الطلب");

    const now = new Date();
    const saleId = (sale as unknown as { _id: { toString(): string } })._id.toString();
    const res = await OnlineOrderModel.findOneAndUpdate(
      { _id: order._id, version: order.version },
      {
        $set: {
          status: "DELIVERED",
          paymentState: "PAID_ONLINE" as OnlinePaymentState,
          paymentCollected: true,
          saleId,
          invoiceNumber: sale.invoiceNumber,
          deliveredAt: now,
          version: order.version + 1,
        },
        $push: {
          statusHistory: {
            status: "DELIVERED" as OnlineOrderStatus,
            at: now,
            by: { id: authed.id, username: authed.username },
            metadata: { online: true, invoiceNumber: sale.invoiceNumber },
          },
        },
      },
      { returnDocument: "after", session },
    ).lean<OnlineOrderDocument>();

    if (!res) {
      throw new AppError("CONFLICT", "تعذّر تحديث الطلب لأن حالته تغيّرت. حاول مرة أخرى");
    }

    await InventoryReservationModel.updateMany(
      { onlineOrder: order._id, status: "RESERVED" },
      { $set: { status: "FULFILLED" as ReservationStatus, fulfilledAt: now } },
      { session },
    );

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "online.order.delivered",
      entity: "online_order",
      entityId: order._id.toString(),
      after: { orderNumber: order.orderNumber, invoiceNumber: sale.invoiceNumber },
    });

    return toOnlineOrderDto(res);
  });
}

/**
 * Delivery workflow list: orders available for delivery (ready/out) plus those
 * assigned to the current delivery employee. Requires `delivery.orders.read`.
 */
export async function listDeliveryOrders(
  actor: AuthUser | null,
): Promise<OnlineOrderDto[]> {
  requirePermission(actor, "delivery.orders.read");
  await dbConnect();
  const scope: Record<string, unknown> =
    actor?.isOwner || actor?.role === "MANAGER"
      ? { status: { $in: ["READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] } }
      : {
          $or: [
            { "assignedTo.id": actor?.id, status: { $nin: TERMINAL_ONLINE_STATUSES } },
            { status: "READY_FOR_DELIVERY", assignedTo: { $exists: false } },
          ],
        };
  const rows = await OnlineOrderModel.find(
    scope as unknown as Parameters<typeof OnlineOrderModel.find>[0],
  )
    .sort({ createdAt: 1 })
    .limit(100)
    .lean<OnlineOrderDocument[]>();
  return rows.map(toOnlineOrderDto);
}

export type { OnlineOrder };
