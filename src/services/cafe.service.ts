import mongoose from "mongoose";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { nextSequenceValue } from "@/models/sequence";
import { ProductModel } from "@/models/product";
import { CustomerModel } from "@/models/customer";
import {
  CafeOrderModel,
  CAFE_ORDER_STATUSES,
  TERMINAL_CAFE_STATUSES,
  type CafeOrderDocument,
  type CafeOrderStatus,
} from "@/models/cafe-order";
import {
  EventOutboxModel,
  type CafeEventType,
} from "@/models/event-outbox";
import {
  cafeOrderCreateSchema,
  type CafeOrderCreateInput,
} from "@/lib/validations/cafe";

/**
 * Café orders & Barista KDS core (Phase 7).
 *
 * Business flow: a cashier creates an operational café order; a barista sees it
 * on the KDS board and advances it through the state machine
 * NEW → PREPARING → READY → COMPLETED (or CANCELLED via an allowed transition).
 *
 * - `createOrder` snapshots product name/unit price for stability, computes all
 *   totals server-side, and is idempotent on `idempotencyKey`.
 * - `transitionOrder` is the single authoritative transition entry point. It
 *   validates the state machine, uses optimistic concurrency on `version`, and
 *   appends a business event to the transactional outbox so the KDS updates.
 *
 * Financial note (Phase 7 limitation): order creation is operational only — no
 * Sale / payment is recorded here. Payment integration for café orders is a
 * later concern and intentionally out of scope.
 */

export interface CafeOrderItemDto {
  productId: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  notes: string;
}

export interface CafeHistoryEntryDto {
  status: CafeOrderStatus;
  at: string;
  by: string;
}

export interface CafeOrderDto {
  id: string;
  orderNumber: string;
  items: CafeOrderItemDto[];
  totalAmount: number;
  status: CafeOrderStatus;
  customerId: string | null;
  customerName: string;
  note: string;
  version: number;
  history: CafeHistoryEntryDto[];
  createdBy: string;
  createdAt: string;
  ageSeconds: number;
}

export interface CafeEventDto {
  eventId: string;
  type: CafeEventType;
  aggregateId: string;
  version: number;
  sequence: number;
  payload: Record<string, unknown>;
}

/** Status identifier re-exported for the actions layer. */
export type CafeOrderStatusDto = CafeOrderStatus;

/** Café product search result (id + name + price for the order builder). */
export interface CafeProductSearchDto {
  id: string;
  name: string;
  unit: string;
  sellingPrice: number;
}

/** Customer search result for optional café order association. */
export interface CafeCustomerSearchDto {
  id: string;
  name: string;
}

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", result.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }
  return result.data;
}

function toCafeOrderDto(o: CafeOrderDocument): CafeOrderDto {
  const items = (o.items ?? []).map((i) => ({
    productId: (i.productId as { toString?: () => string } | string)?.toString?.() ?? String(i.productId),
    productName: i.productName,
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    lineTotal: i.lineTotal,
    notes: i.notes ?? "",
  }));
  const now = Date.now();
  const createdAt = o.createdAt ? new Date(o.createdAt as unknown as Date).getTime() : now;
  return {
    id: o._id.toString(),
    orderNumber: o.orderNumber,
    items,
    totalAmount: o.totalAmount,
    status: o.status,
    customerId: o.customerId ? o.customerId.toString() : null,
    customerName: o.customerName ?? "",
    note: o.note ?? "",
    version: o.version ?? 0,
    history: (o.statusHistory ?? []).map((h) => ({
      status: h.status,
      at: h.at ? new Date(h.at).toISOString() : "",
      by: h.by?.username ?? "",
    })),
    createdBy: o.createdBy?.username ?? "",
    createdAt: new Date(createdAt).toISOString(),
    ageSeconds: Math.floor((now - createdAt) / 1000),
  };
}

/* ---- State machine ---- */

const ALLOWED_TRANSITIONS: Record<CafeOrderStatus, readonly CafeOrderStatus[]> = {
  NEW: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

function assertTransition(current: CafeOrderStatus, target: CafeOrderStatus): void {
  if (current === target) {
    throw new AppError("CONFLICT", "الطلب بالفعل في هذه الحالة");
  }
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(target)) {
    throw new AppError(
      "CONFLICT",
      "لا يمكن تغيير حالة الطلب من «" + current + "» إلى «" + target + "»",
    );
  }
}

/** Returns the permission required to reach `target` (cancel is a distinct permission). */
function transitionPermission(target: CafeOrderStatus): "cafe.orders.status" | "cafe.orders.cancel" {
  return target === "CANCELLED" ? "cafe.orders.cancel" : "cafe.orders.status";
}

async function appendEvents(
  session: mongoose.ClientSession,
  events: Array<{
    type: CafeEventType;
    aggregateId: string;
    version: number;
    payload: Record<string, unknown>;
  }>,
): Promise<void> {
  if (events.length === 0) return;
  for (const e of events) {
    const seq = await nextSequenceValue("cafe-event-outbox", session);
    await EventOutboxModel.create(
      [
        {
          eventId:
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${seq}-${Math.random().toString(36).slice(2)}`,
          type: e.type,
          aggregateType: "cafe_order",
          aggregateId: e.aggregateId,
          version: e.version,
          sequence: seq,
          payload: e.payload,
        },
      ],
      { session },
    );
  }
}

/* ---- Create ---- */

interface ResolvedItem {
  productId: mongoose.Types.ObjectId;
  productName: string;
  unitPrice: number;
  quantity: number;
  notes?: string;
  lineTotal: number;
}

/**
 * Creates an operational café order. Requires `cafe.orders.create`.
 * Server loads products, snapshots name/price, and computes totals; the client
 * only supplies product ids, quantities, and notes.
 */
export async function createCafeOrder(
  actor: AuthUser | null,
  input: CafeOrderCreateInput,
): Promise<CafeOrderDto> {
  const authed = requirePermission(actor, "cafe.orders.create");
  await dbConnect();
  input = parseOrThrow(cafeOrderCreateSchema, input);

  return withTransaction(async (session) => {
    if (input.idempotencyKey) {
      const existing = await CafeOrderModel.findOne({ idempotencyKey: input.idempotencyKey })
        .session(session)
        .lean<CafeOrderDocument>();
      if (existing) return toCafeOrderDto(existing);
    }

    // Resolve products server-side.
    const items: ResolvedItem[] = [];
    const seen = new Set<string>();
    for (const line of input.items) {
      if (seen.has(line.productId)) {
        throw new AppError("VALIDATION", "يوجد صنف مكرر في الطلب");
      }
      seen.add(line.productId);
      const product = await ProductModel.findById(line.productId)
        .session(session)
        .select("name sellingPrice active")
        .lean<{ _id: mongoose.Types.ObjectId; name: string; sellingPrice: number; active: boolean }>();
      if (!product || !product.active) {
        throw new AppError("NOT_FOUND", "أحد الأصناف غير موجود أو غير نشط");
      }
      const quantity = Math.round(line.quantity);
      const unitPrice = Math.round(product.sellingPrice * 100) / 100;
      items.push({
        productId: product._id,
        productName: product.name,
        unitPrice,
        quantity,
        notes: line.notes ?? "",
        lineTotal: Math.round(unitPrice * quantity * 100) / 100,
      });
    }

    // Optional customer association (validation only; no financial posting).
    let customerId: mongoose.Types.ObjectId | undefined;
    let customerName = "";
    if (input.customerId) {
      const customer = await CustomerModel.findById(input.customerId)
        .session(session)
        .select("name active")
        .lean<{ _id: mongoose.Types.ObjectId; name: string; active: boolean }>();
      if (!customer || !customer.active) {
        throw new AppError("NOT_FOUND", "العميل غير موجود أو غير نشط");
      }
      customerId = customer._id;
      customerName = customer.name;
    }

    const totalAmount = Math.round(items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100;

    const now = new Date();
    const dayKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const seq = await nextSequenceValue(`cafe-order-${dayKey}`, session);
    const orderNumber = `CF-${dayKey}-${String(seq).padStart(4, "0")}`;

    const [order] = await CafeOrderModel.create(
      [
        {
          orderNumber,
          items: items.map((i) => ({
            productId: i.productId,
            productName: i.productName,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            lineTotal: i.lineTotal,
            notes: i.notes,
          })),
          totalAmount,
          status: "NEW" as CafeOrderStatus,
          version: 0,
          statusHistory: [
            {
              status: "NEW",
              at: now,
              by: { id: authed.id, username: authed.username },
            },
          ],
          customerId,
          customerName,
          note: input.note ?? "",
          createdBy: { id: authed.id, username: authed.username },
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session },
    );
    if (!order) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء إنشاء الطلب");

    await appendEvents(session, [
      {
        type: "CAFE_ORDER_CREATED",
        aggregateId: order._id.toString(),
        version: order.version,
        payload: { orderId: order._id.toString(), orderNumber, status: "NEW" },
      },
    ]);

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "cafe_order.created",
      entity: "cafe_order",
      entityId: order._id.toString(),
      after: { orderNumber, status: "NEW", totalAmount },
    });

    return toCafeOrderDto(order);
  });
}

/* ---- Transition ---- */

/**
 * The single authoritative state-machine transition. Validates the target state
 * against the current state, uses optimistic concurrency on `version`, appends
 * an outbox event, and records an audit entry.
 *
 * Cancel requires `cafe.orders.cancel`; all other transitions require
 * `cafe.orders.status`.
 */
export async function transitionCafeOrder(
  actor: AuthUser | null,
  orderId: string,
  targetStatus: CafeOrderStatus,
): Promise<CafeOrderDto> {
  const permission = transitionPermission(targetStatus);
  const authed = requirePermission(actor, permission);
  await dbConnect();

  if (!CAFE_ORDER_STATUSES.includes(targetStatus)) {
    throw new AppError("VALIDATION", "حالة غير صحيحة");
  }

  return withTransaction(async (session) => {
    const current = await CafeOrderModel.findById(orderId)
      .session(session)
      .select("status version statusHistory")
      .lean<CafeOrderDocument>();
    if (!current) throw new AppError("NOT_FOUND", "الطلب غير موجود");

    assertTransition(current.status, targetStatus);

    // Optimistic concurrency: only advance when version matches.
    const version = current.version ?? 0;
    const setFields: Record<string, unknown> = { status: targetStatus };
    if (targetStatus === "COMPLETED") setFields.completedAt = new Date();
    if (targetStatus === "CANCELLED") setFields.cancelledAt = new Date();
    const update: mongoose.UpdateQuery<CafeOrderDocument> = {
      $set: setFields,
      $inc: { version: 1 },
      $push: {
        statusHistory: {
          status: targetStatus,
          at: new Date(),
          by: { id: authed.id, username: authed.username },
        },
      },
    };

    const res = await CafeOrderModel.findOneAndUpdate(
      { _id: orderId, version },
      update,
      { session, returnDocument: "after" },
    ).lean<CafeOrderDocument>();
    if (!res) {
      throw new AppError("CONFLICT", "تغيّر الطلب أثناء المعالجة — حدّث الصفحة وأعد المحاولة");
    }

    await appendEvents(session, [
      {
        type: "CAFE_ORDER_STATUS_CHANGED",
        aggregateId: orderId,
        version: (res.version ?? 0),
        payload: {
          orderId,
          orderNumber: res.orderNumber,
          from: current.status,
          to: targetStatus,
          version: res.version ?? 0,
        },
      },
    ]);

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "cafe_order.status_changed",
      entity: "cafe_order",
      entityId: orderId,
      before: { status: current.status },
      after: { status: targetStatus, version: res.version ?? 0 },
    });

    return toCafeOrderDto(res);
  });
}

/* ---- Reads ---- */

/**
 * KDS board: the active (in-progress) orders, oldest first, so the barista sees
 * the earliest orders first. Requires `cafe.kds.view`.
 */
export async function listKdsOrders(
  actor: AuthUser | null,
): Promise<CafeOrderDto[]> {
  requirePermission(actor, "cafe.kds.view");
  await dbConnect();
  const rows = await CafeOrderModel.find({
    status: { $in: ["NEW", "PREPARING", "READY"] },
  })
    .sort({ createdAt: 1 })
    .lean<CafeOrderDocument[]>();
  return rows.map(toCafeOrderDto);
}

/**
 * Active (non-terminal) café orders for the cashier view (which does not expose
 * the KDS). Requires `cafe.orders.read`. Oldest first.
 */
export async function listActiveCafeOrders(
  actor: AuthUser | null,
): Promise<CafeOrderDto[]> {
  requirePermission(actor, "cafe.orders.read");
  await dbConnect();
  const rows = await CafeOrderModel.find({
    status: { $nin: TERMINAL_CAFE_STATUSES },
  })
    .sort({ createdAt: 1 })
    .lean<CafeOrderDocument[]>();
  return rows.map(toCafeOrderDto);
}

/**
 * Recently finished orders (COMPLETED / CANCELLED) for a simple history view.
 * Requires `cafe.orders.read`.
 */
export async function listCafeOrderHistory(
  actor: AuthUser | null,
  limit = 50,
): Promise<CafeOrderDto[]> {
  requirePermission(actor, "cafe.orders.read");
  await dbConnect();
  const rows = await CafeOrderModel.find({
    status: { $in: TERMINAL_CAFE_STATUSES },
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean<CafeOrderDocument[]>();
  return rows.map(toCafeOrderDto);
}

/**
 * Product search for the café order builder. Active sellable products only.
 * Requires `cafe.orders.create`.
 */
export async function cafeSearchProducts(
  actor: AuthUser | null,
  query: string,
): Promise<CafeProductSearchDto[]> {
  requirePermission(actor, "cafe.orders.create");
  await dbConnect();
  const q = query.trim();
  if (!q) return [];
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await ProductModel.find({ active: true, $or: [{ name: { $regex: re } }, { sku: { $regex: re } }, { barcode: { $regex: re } }] })
    .sort({ name: 1 })
    .limit(30)
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string; unit: string; sellingPrice: number }>>();
  return rows.map((p) => ({
    id: p._id.toString(),
    name: p.name,
    unit: p.unit,
    sellingPrice: p.sellingPrice,
  }));
}

/**
 * Customer search for optional café order association. Active customers by
 * name / phone. Requires `cafe.orders.create`.
 */
export async function cafeSearchCustomers(
  actor: AuthUser | null,
  query: string,
): Promise<CafeCustomerSearchDto[]> {
  requirePermission(actor, "cafe.orders.create");
  await dbConnect();
  const q = query.trim();
  if (!q) return [];
  const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await CustomerModel.find({ active: true, $or: [{ name: { $regex: re } }, { phone: { $regex: re } }] })
    .sort({ name: 1 })
    .limit(10)
    .select("name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  return rows.map((c) => ({ id: c._id.toString(), name: c.name }));
}

/**
 * Polls outbox events newer than `after` for the SSE stream. Requires a café
 * read permission (kds.view or orders.read). Used by the realtime route.
 */
export async function pollOutboxEvents(
  actor: AuthUser | null,
  after: number,
  limit = 50,
): Promise<CafeEventDto[]> {
  requirePermission(actor, ["cafe.kds.view", "cafe.orders.read"]);
  await dbConnect();
  const rows = await EventOutboxModel.find({ sequence: { $gt: after } })
    .sort({ sequence: 1 })
    .limit(limit)
    .select("eventId type aggregateId version sequence payload")
    .lean<Array<{
      eventId: string;
      type: CafeEventType;
      aggregateId: string;
      version: number;
      sequence: number;
      payload: Record<string, unknown>;
    }>>();
  return rows.map((r) => ({
    eventId: r.eventId,
    type: r.type,
    aggregateId: r.aggregateId,
    version: r.version,
    sequence: r.sequence,
    payload: r.payload,
  }));
}

/** Latest outbox sequence (resume point for a fresh SSE connection). */
export async function latestOutboxSequence(actor: AuthUser | null): Promise<number> {
  requirePermission(actor, ["cafe.kds.view", "cafe.orders.read"]);
  await dbConnect();
  const doc = await EventOutboxModel.findOne({})
    .sort({ sequence: -1 })
    .select("sequence")
    .lean<{ sequence: number }>();
  return doc?.sequence ?? 0;
}

/** Re-exports for typing convenience. */
export const CafeOrderStatusUtil = {
  CAFE_ORDER_STATUSES,
  TERMINAL_CAFE_STATUSES,
  list: CAFE_ORDER_STATUSES,
};
