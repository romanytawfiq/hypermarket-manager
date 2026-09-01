import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import { CAFE_SUGAR_LEVELS, type CafeSugarLevel } from "@/lib/cafe/sugar";

/**
 * CafeOrder (Phase 7, extended in 7.1).
 *
 * A café order flows from the cashier to the Barista KDS. Each line snapshots
 * the product name, unit price, quantity, an optional sugar level, and a
 * per-line note/customization so later catalog/price changes cannot corrupt
 * history (mirrors BR-006). Sugar belongs to the individual cup: two cups of
 * the same product with different sugar levels are separate order lines and
 * are never merged.
 *
 * Financial integration (Phase 7.1): creating an order also records the retail
 * Sale + payment through the existing sales service (`createSaleWithSession`)
 * inside the same MongoDB transaction. `saleId`/`invoiceNumber` link the
 * operational order to its immutable financial record (authoritative); the
 * order does not duplicate payment documents. `CafeOrder.totalAmount` and
 * `Sale.total`/`Payment.total` are computed from the same server-side source so
 * they cannot diverge.
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
  /** Structured per-cup sugar level snapshot ("no sugar selection recorded" when absent). */
  sugarLevel?: CafeSugarLevel;
  /** Per-line note / customization, e.g. "حليب إضافي". */
  notes?: string;
}

export interface CafeStatusHistoryEntry {
  status: CafeOrderStatus;
  at: Date;
  by?: { id?: string; username?: string };
}

export interface CafeOrder {
  orderNumber: string; // "CF-YYYYMMDD-NNNN" (distinct from the INV-… sale invoice number)
  items: CafeOrderItem[];
  totalAmount: number;
  status: CafeOrderStatus;
  /** Optional linked customer (snapshot only; the Sale carries the financial link). */
  customerId?: mongoose.Types.ObjectId;
  customerName?: string;
  /** Order-level note, e.g. "حليب إضافي". */
  note?: string;
  /** Monotonic version incremented on each transition (optimistic concurrency). */
  version: number;
  statusHistory: CafeStatusHistoryEntry[];
  createdBy?: { id?: string; username?: string };
  idempotencyKey?: string;
  /** Stable id of the immutable Sale recorded for this order (authoritative financial doc). */
  saleId?: string;
  /** Snapshot of the Sale invoice number for display/history (e.g. "INV-20260831-0001"). */
  invoiceNumber?: string;
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
          sugarLevel: { type: String, enum: CAFE_SUGAR_LEVELS },
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
    saleId: {
      type: String,
      index: { unique: true, sparse: true },
    },
    invoiceNumber: { type: String, trim: true, maxlength: 40, default: "" },
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
