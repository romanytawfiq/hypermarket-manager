import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * OnlineOrder (Phase 9).
 *
 * A guest (customer) order placed through the public online store. Payment is by
 * default COD (`paymentMethod: "COD"`): an order is created unpaid and stays
 * `PAYMENT_PENDING` until a delivery employee collects cash at delivery. When
 * enabled, a customer may instead pay online (`paymentMethod: "ONLINE"`) through
 * the Kashier gateway; the authoritative capture is confirmed by the Kashier
 * server webhook, which flips `paymentState` to `PAID_ONLINE` — no client or
 * redirect value alone can mark an order paid (no fabricated payment success).
 *
 * Financial integration: the online order is NOT a Sale at creation. A Sale +
 * CASH payment is posted only when COD is collected at delivery, using the
 * existing `createSaleWithSession` against the collecting employee's OPEN
 * cashier shift. `saleId`/`invoiceNumber`/`codCollectedAt` record that posting
 * so the order and its immutable financial record can never diverge (mirrors
 * the Phase 7.1 café integration). Until then the order holds no financial
 * documents and no fabricated payment success is ever recorded.
 *
 * Inventory integration: availability is reserved at checkout (embedded
 * `reservedQuantity` on each line) through the reservation service, which
 * holds stock so two customers cannot claim the last unit. When COD is
 * collected, the posted Sale consumes the reserved stock (`FULFILLED`); on
 * cancellation the reservation is released (`RELEASED`) back to stock. The
 * server is authoritative for all prices and totals (BR-001).
 *
 * Lifecycle is a server-validated state machine:
 *
 *   PENDING → CONFIRMED → PREPARING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY → DELIVERED
 *   (any active state → CANCELLED)
 *
 * `transitionOrder` is the single authoritative transition entry point. The
 * `version` field is incremented on every transition via optimistic
 * concurrency (`findOneAndUpdate`), so a stale/concurrent writer is rejected
 * rather than silently overwriting state; `statusHistory` preserves the full
 * audit trail (idempotent, replay-safe).
 *
 * Customer ownership/tracking: guest orders carry a server-generated
 * `trackingToken` used with the order number for read-only tracking (no
 * customer-account credentials exist). The shipment is `assignedTo` a delivery
 * employee for the delivery workflow.
 */
export type OnlineOrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY_FOR_DELIVERY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export const ONLINE_ORDER_STATUSES: readonly OnlineOrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

/** Terminal statuses that cannot transition further. */
export const TERMINAL_ONLINE_STATUSES: readonly OnlineOrderStatus[] = [
  "DELIVERED",
  "CANCELLED",
];

/** Active statuses that still hold inventory reservations. */
export const ACTIVE_ONLINE_STATUSES: readonly OnlineOrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
];

export const ONLINE_PAYMENT_STATES = [
  "PAYMENT_PENDING",
  "PAID_ONLINE",
  "PAID_AT_DELIVERY",
] as const;

export type OnlinePaymentState = (typeof ONLINE_PAYMENT_STATES)[number];

/** How the customer chose to pay for an online order. */
export const ONLINE_PAYMENT_METHODS = ["COD", "ONLINE"] as const;
export type OnlineOrderPaymentMethod = (typeof ONLINE_PAYMENT_METHODS)[number];

/** A confirmed address snapshot with the required delivery fields. */
export interface OnlineOrderAddress {
  fullName: string;
  phone: string;
  city: string;
  area: string;
  street: string;
  landmark?: string;
  notes?: string;
  [key: string]: unknown;
}

export interface OnlineOrderItem {
  productId: mongoose.Types.ObjectId;
  /** Snapshot of the product name at order creation. */
  productName: string;
  /** Snapshot of the unit price (server-derived). */
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Quantity held in inventory until fulfillment/release. */
  reservedQuantity: number;
}

export interface OnlineStatusHistoryEntry {
  status: OnlineOrderStatus;
  at: Date;
  by?: { id?: string; username?: string };
}

export interface OnlineOrder {
  /** "ON-YYYYMMDD-NNNN". */
  orderNumber: string;
  customerName: string;
  customerEmail?: string;
  customerPhone: string;
  deliveryAddress: OnlineOrderAddress;
  items: OnlineOrderItem[];
  /** Server-derived subtotal of item line totals (before delivery fee). */
  totalAmount: number;
  /** Server-derived fee added to the order total. Configurable, default 0. */
  deliveryFee: number;
  /** totalAmount + deliveryFee. */
  payableAmount: number;
  status: OnlineOrderStatus;
  paymentState: OnlinePaymentState;
  /** The customer's chosen payment method ("COD" default, or "ONLINE"). */
  paymentMethod: OnlineOrderPaymentMethod;
  /** True once the order is actually paid (COD collected OR online captured). */
  paymentCollected: boolean;
  /** Stable id of the immutable Sale posted at COD collection. */
  saleId?: string;
  /** Snapshot of the Sale invoice number (e.g. "INV-…"). */
  invoiceNumber?: string;
  codCollectedAt?: Date;
  /** Online payment detail (verified via the Kashier webhook). */
  onlinePayment?: {
    /** Kashier session id persisted when the hosted payment page is created. */
    sessionId?: string;
    /** Opaque pending-payment reference reconciled at redirect-return. */
    paymentToken?: string;
    /** Time the Kashier session was created (payment initiated). */
    initiatedAt?: Date;
    /** Kashier transaction id (set once the webhook marks the payment captured). */
    transactionId?: string;
    /** Kashier payment status/card brand snapshot. */
    status?: string;
    /** Time the webhook marked the payment captured. */
    paidAt?: Date;
  };
  /** Delivery employee assigned to fulfill this order. */
  assignedTo?: { id: string; username: string };
  trackingToken: string;
  /** Monotonic version incremented on each transition (optimistic concurrency). */
  version: number;
  statusHistory: OnlineStatusHistoryEntry[];
  createdBy?: { id?: string; username?: string };
  idempotencyKey?: string;
  cancelledAt?: Date;
  deliveredAt?: Date;
}

export type OnlineOrderDocument = OnlineOrder &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const onlineOrderSchema = new mongoose.Schema<OnlineOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, trim: true, default: "" },
    customerPhone: { type: String, required: true, trim: true },
    deliveryAddress: {
      type: {
        fullName: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        area: { type: String, required: true, trim: true },
        street: { type: String, required: true, trim: true },
        landmark: { type: String, trim: true, default: "" },
        notes: { type: String, trim: true, maxlength: 500, default: "" },
      },
      required: true,
    },
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
          reservedQuantity: { type: Number, required: true, min: 0 },
        },
      ],
      required: true,
      validate: [(v: OnlineOrderItem[]) => Array.isArray(v) && v.length > 0, "أضف صنفًا واحدًا على الأقل"],
    },
    totalAmount: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, default: 0, min: 0 },
    payableAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ONLINE_ORDER_STATUSES,
      default: "PENDING",
      index: true,
    },
    paymentState: {
      type: String,
      enum: ONLINE_PAYMENT_STATES,
      default: "PAYMENT_PENDING",
    },
    paymentMethod: {
      type: String,
      enum: ONLINE_PAYMENT_METHODS,
      default: "COD",
    },
    paymentCollected: { type: Boolean, default: false },
    saleId: { type: String, index: { unique: true, sparse: true } },
    invoiceNumber: { type: String, trim: true, maxlength: 40, default: "" },
    codCollectedAt: { type: Date },
    onlinePayment: {
      sessionId: { type: String },
      paymentToken: { type: String },
      initiatedAt: { type: Date },
      transactionId: { type: String },
      status: { type: String },
      paidAt: { type: Date },
    },
    assignedTo: {
      id: { type: String },
      username: { type: String },
    },
    trackingToken: { type: String, required: true, index: true },
    version: { type: Number, default: 0 },
    statusHistory: {
      type: [
        {
          status: { type: String, enum: ONLINE_ORDER_STATUSES, required: true },
          at: { type: Date, default: () => new Date() },
          by: { id: { type: String }, username: { type: String } },
        },
      ],
      default: [],
    },
    createdBy: { id: { type: String }, username: { type: String } },
    idempotencyKey: { type: String, index: { unique: true, sparse: true } },
    cancelledAt: { type: Date },
    deliveredAt: { type: Date },
  },
  { timestamps: true },
);

// Delivery board reads: active orders by status (oldest first).
onlineOrderSchema.index({ status: 1, createdAt: 1 });
// Lookup by tracking token for guest tracking.
onlineOrderSchema.index({ trackingToken: 1, orderNumber: 1 });
// Assigned delivery employee reads.
onlineOrderSchema.index({ assignedTo: 1, status: 1 });

export const OnlineOrderModel: Model<OnlineOrder> =
  (mongoose.models.OnlineOrder as Model<OnlineOrder> | undefined) ??
  mongoose.model<OnlineOrder>("OnlineOrder", onlineOrderSchema);