import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Purchase (from a supplier).
 *
 * An immutable historical financial + inventory record. Purchase items are
 * embedded (read together with the purchase, architecture §6 aggregate roots).
 * Each item snapshots its own cost and the accepted/rejected quantities so later
 * catalog/price changes cannot corrupt history (BR-006).
 *
 * Payment handling is captured by the supplier ledger, not by mutable fields on
 * this document; `paidAmount` here is a snapshot of the initially paid portion
 * for immediate cash purchases (BR-015). Later supplier payments are recorded
 * through SupplierPayment + ledger entries (BR-016/BR-017).
 */
export const PURCHASE_STATUS = ["PENDING", "PARTIALLY_RECEIVED", "RECEIVED"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUS)[number];

export interface PurchaseItem {
  product: mongoose.Types.ObjectId;
  /** Product name snapshot for readable history. */
  productName: string;
  /** Ordered / invoiced quantity. */
  quantity: number;
  /** Unit purchase cost snapshot — historical, never the mutable catalog price. */
  cost: number;
  /** Accepted (received into stock) quantity. */
  receivedQuantity: number;
  /** Rejected quantity (damaged / not accepted). */
  rejectedQuantity: number;
  /** Per-item line total (cost * quantity), snapshot computed at creation. */
  lineTotal: number;
  /** Optional batch code when the product is expiry-tracked. */
  batchCode?: string;
  /** Optional expiry date for the received batch. */
  expiryDate?: Date;
}

export interface Purchase {
  /** Sequential human-friendly purchase number (e.g. "P-0001"). */
  purchaseNumber: string;
  supplier: mongoose.Types.ObjectId;
  /** Supplier name snapshot, for readable history if the supplier is renamed. */
  supplierName: string;
  /** Optional external supplier invoice number. */
  invoiceNumber?: string;
  /** Supplier payment terms snapshot (e.g. "نقدي" / "آجل"). */
  paymentTerms?: string;
  items: PurchaseItem[];
  /** Sum of line totals. Computed server-side. */
  totalAmount: number;
  /** Total accepted quantity (used for receiving / status). */
  receivedQuantity: number;
  status: PurchaseStatus;
  /** Whether the purchase is fully paid (cash purchase) — informational snapshot. */
  paid: boolean;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
}

export type PurchaseDocument = Purchase &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const purchaseItemSchema = new mongoose.Schema<PurchaseItem>(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    cost: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    rejectedQuantity: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    batchCode: { type: String, default: "" },
    expiryDate: { type: Date },
  },
  { _id: true },
);

const purchaseSchema = new mongoose.Schema<Purchase>(
  {
    purchaseNumber: { type: String, required: true, unique: true, index: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    supplierName: { type: String, required: true },
    invoiceNumber: { type: String, default: "" },
    paymentTerms: { type: String, default: "" },
    items: { type: [purchaseItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },
    receivedQuantity: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: PURCHASE_STATUS, default: "PENDING" },
    paid: { type: Boolean, default: false },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
  },
  { timestamps: true },
);

// Operational queries: purchases per supplier, and by external invoice number.
purchaseSchema.index({ supplier: 1, createdAt: -1 });
purchaseSchema.index({ invoiceNumber: 1 });
purchaseSchema.index({ status: 1, createdAt: -1 });

export const PurchaseModel: Model<Purchase> =
  (mongoose.models.Purchase as Model<Purchase> | undefined) ??
  mongoose.model<Purchase>("Purchase", purchaseSchema);
