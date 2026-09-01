import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * CafeOrder (Phase 7).
 *
 * A café order is an *operational* order flowing from cashier to the Barista
 * KDS. Each line snapshots the product name, unit price, quantity, and a
 * per-line note so later catalog/price changes cannot corrupt history
 * (mirrors BR-006). The order carries an order-level note too ("بدون سكر").
 *
 * The lifecycle is a server-validated state machine:
 *
 *   NEW → PREPARING → READY → COMPLETED
 *   NEW → CANCELLED; PREPARING → CANCELLED
 *
 * `transitionOrder` is the single authoritative transition entry point. The
 * `version` field is incremented on every transition via optimistic concurrency
 * (`findOneAndUpdate`), so a stale/concurrent writer is rejected rather than
 * silently overwriting state; `statusHistory` preserves the full audit trail of
 * transitions (idempotent, replay-safe).
 *
 * Financial note: Phase 7 treats café order creation as operational only. Sale /
 * payment recording for café orders is a separate, later concern and is NOT
 * performed here (documented limitation).
 */
export const CAFE_ORDER_STATUSES = [
  "NEW",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED",
] as const;

export type CafeOrderStatus = (typeof CAFE_ORDER_STATUSES)[number];

/** Terminal statuses that cannot transition further. */
export const TERMINAL_CAFE_STATUSES: readonly CafeOrderStatus[] = [
  "COMPLETED",
  "CANCELLED",
];

export interface CafeOrderItem {
  productId: mongoose.Types.ObjectId;
  /** Snapshot of the product name at order creation. */
  productName: string;
  /** Snapshot of the unit price at order creation (server-derived). */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Per-line note, e.g. "بدون سكر". */
  notes?: string;
}

export interface CafeStatusHistoryEntry {
  status: CafeOrderStatus;
  at: Date;
  by?: { id?: string; username?: string };
}

export interface CafeOrder {
  orderNumber: string; // "CF-YYYYMMDD-NNNN"
  items: CafeOrderItem[];
  totalAmount: number;
  status: CafeOrderStatus;
  /** Optional linked customer (association only — no financial posting here). */
  customerId?: mongoose.Types.ObjectId;
  customerName?: string;
  /** Order-level note, e.g. "حليب إضافي". */
  note?: string;
  /** Monotonic version incremented on each transition (optimistic concurrency). */
  version: number;
  statusHistory: CafeStatusHistoryEntry[];
  createdBy?: { id?: string; username?: string };
  idempotencyKey?: string;
  cancelledAt?: Date;
  completedAt?: Date;
}

export type CafeOrderDocument = CafeOrder &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const cafeOrderSchema = new mongoose.Schema<CafeOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    items: {
      type: [
        {
          productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
          },
          productName: { type: String, required: true, trim: true },
          unitPrice: { type: Number, required: true, min: 0 },
          quantity: { type: Number, required: true, min: 1 },
          lineTotal: { type: Number, required: true, min: 0 },
          notes: { type: String, trim: true, maxlength: 200, default: "" },
        },
      ],
      required: true,
      validate: [(v: CafeOrderItem[]) => Array.isArray(v) && v.length > 0, "أضف صنفًا واحدًا على الأقل"],
    },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: CAFE_ORDER_STATUSES,
      default: "NEW",
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      index: true,
    },
    customerName: { type: String, trim: true, maxlength: 200, default: "" },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    version: { type: Number, default: 0 },
    statusHistory: {
      type: [
        {
          status: { type: String, enum: CAFE_ORDER_STATUSES, required: true },
          at: { type: Date, default: () => new Date() },
          by: { id: { type: String }, username: { type: String } },
        },
      ],
      default: [],
    },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
    idempotencyKey: {
      type: String,
      index: { unique: true, sparse: true },
    },
    cancelledAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

// KDS board reads: active orders oldest-first.
cafeOrderSchema.index({ status: 1, createdAt: 1 });
// History / reporting reads.
cafeOrderSchema.index({ createdAt: -1 });

export const CafeOrderModel: Model<CafeOrder> =
  (mongoose.models.CafeOrder as Model<CafeOrder> | undefined) ??
  mongoose.model<CafeOrder>("CafeOrder", cafeOrderSchema);
