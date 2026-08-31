import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/sales/constants";

/**
 * Retail sale (POS transaction).
 *
 * A canonical successful retail sale is an immutable historical financial +
 * inventory record (BR-005, BR-006). Items snapshot their own unit price and
 * cost so later catalog changes cannot corrupt history. Payments are embedded
 * (read together with the sale) and may be mixed across methods (BR-008).
 *
 * Inventory is decreased transactionally via the inventory service at sale
 * creation; each line produces an append-only SALE stock movement.
 *
 * `idempotencyKey` (unique, sparse) protects against duplicate submission on
 * retry/double-click: a sale carrying an already-used key is treated as a
 * duplicate and is not created twice (architecture §9, REQ-PAY idempotency).
 */
export const SALE_STATUS = ["COMPLETED"] as const;
export type SaleStatus = (typeof SALE_STATUS)[number];

/**
 * Payment completion state.
 *  - PAID    → fully settled at the register (all Phase 4 sales)
 *  - PARTIAL → some paid, some outstanding (credit sale with partial payment)
 *  - UNPAID  → full credit, no amount collected at the register
 */
export const SALE_PAYMENT_STATE = ["PAID", "PARTIAL", "UNPAID"] as const;
export type SalePaymentState = (typeof SALE_PAYMENT_STATE)[number];

export interface SaleItem {
  product: mongoose.Types.ObjectId;
  /** Product name snapshot for readable history. */
  productName: string;
  /** Unit price snapshot — never the mutable catalog price. */
  unitPrice: number;
  /** Quantity sold. */
  quantity: number;
  /** Per-item line total (unitPrice * quantity). */
  lineTotal: number;
  /** Cost snapshot at sale time (for future profit reporting). */
  cost: number;
  /** Item discount (0 in Phase 4; reserved for the discount business decision). */
  discount: number;
}

export interface Payment {
  method: PaymentMethod;
  /** Amount paid via this method. */
  amount: number;
  /**
   * Payment acceptance state at the register. Phase 4 has no external gateway,
   * so a completed POS payment is recorded as CONFIRMED at the register and no
   * external payment-gateway confirmation is implied.
   */
  status: "CONFIRMED";
}

export interface Sale {
  /** Sequential, concurrency-safe invoice number (e.g. "INV-00001"). */
  invoiceNumber: string;
  /** Cashier snapshot. */
  cashier: { id?: string; username?: string };
  /** The cashier shift this sale is associated with. */
  shift: mongoose.Types.ObjectId;
  /**
   * Linked customer snapshot. When the sale is on a real Customer record,
   * `id` holds the customer's ObjectId string and `name` its snapshot, so
   * history stays intact even if the customer is later renamed or deactivated.
   * Older Phase 4 sales carry only a free-form `name`. The ledger (not this
   * snapshot) is authoritative for amounts (BR-012).
   */
  customer?: { id?: string; name?: string };
  items: SaleItem[];
  /** Sum of line totals (server-computed). */
  totalAmount: number;
  /** Sum of embedded payment amounts (server-computed). */
  totalPaid: number;
  /** The remaining receivable for this sale = totalAmount - totalPaid (snapshot; ledger is authoritative). */
  balanceDue: number;
  /** Payment completion state (PAID for all Phase 4 sales). */
  paymentState: SalePaymentState;
  payments: Payment[];
  status: SaleStatus;
  /** Amount of cash tendered (informational snapshot; change = tendered - cash paid). */
  cashTendered?: number;
  /** Change returned to the customer (server-computed). */
  change?: number;
  /** Client-generated idempotency key preventing duplicate submission. */
  idempotencyKey?: string;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
}

export type SaleDocument = Sale &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const saleItemSchema = new mongoose.Schema<SaleItem>(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
  },
  { _id: true },
);

const paymentSchema = new mongoose.Schema<Payment>(
  {
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    amount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["CONFIRMED"], default: "CONFIRMED" },
  },
  { _id: true },
);

const saleSchema = new mongoose.Schema<Sale>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    cashier: {
      id: { type: String },
      username: { type: String },
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashierShift",
      required: true,
      index: true,
    },
    customer: {
      id: { type: String },
      name: { type: String },
    },
    items: { type: [saleItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },
    totalPaid: { type: Number, required: true, min: 0, default: 0 },
    balanceDue: { type: Number, required: true, min: 0, default: 0 },
    paymentState: { type: String, enum: SALE_PAYMENT_STATE, default: "PAID" },
    payments: { type: [paymentSchema], default: [] },
    status: { type: String, enum: SALE_STATUS, default: "COMPLETED" },
    cashTendered: { type: Number },
    change: { type: Number },
    idempotencyKey: {
      type: String,
      index: { unique: true, sparse: true },
    },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
  },
  { timestamps: true },
);

// Common operational queries: sales per shift, by customer, by cashier/date.
saleSchema.index({ shift: 1, createdAt: -1 });
saleSchema.index({ customer: 1, createdAt: -1 });
saleSchema.index({ createdAt: -1 });
saleSchema.index({ "payments.method": 1, createdAt: -1 });

export const SaleModel: Model<Sale> =
  (mongoose.models.Sale as Model<Sale> | undefined) ??
  mongoose.model<Sale>("Sale", saleSchema);
