import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Supplier return.
 *
 * Records goods returned to a supplier from a purchase. A return reduces the
 * supplier's payable balance (negative ledger entry) and removes the returned
 * quantity from stock (SUPPLIER_RETURN movement). Immutable historical record.
 */
export interface SupplierReturnItem {
  product: mongoose.Types.ObjectId;
  /** Product name snapshot. */
  productName: string;
  /** Unit cost snapshot (from the original purchase). */
  cost: number;
  quantity: number;
  /** Reason for returning this item. */
  reason: string;
  /** Line total = cost * quantity. */
  lineTotal: number;
}

export interface SupplierReturn {
  /** Sequential return number (e.g. "R-0001"). */
  returnNumber: string;
  supplier: mongoose.Types.ObjectId;
  supplierName: string;
  /** Optional source purchase. */
  purchase?: mongoose.Types.ObjectId;
  purchaseNumber?: string;
  items: SupplierReturnItem[];
  totalAmount: number;
  createdBy?: { id?: string; username?: string };
}

export type SupplierReturnDocument = SupplierReturn &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const supplierReturnItemSchema = new mongoose.Schema<SupplierReturnItem>(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    cost: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    reason: { type: String, default: "" },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const supplierReturnSchema = new mongoose.Schema<SupplierReturn>(
  {
    returnNumber: { type: String, required: true, unique: true, index: true },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    supplierName: { type: String, required: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: "Purchase" },
    purchaseNumber: { type: String, default: "" },
    items: { type: [supplierReturnItemSchema], default: [] },
    totalAmount: { type: Number, required: true, min: 0 },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
  },
  { timestamps: true },
);

supplierReturnSchema.index({ supplier: 1, createdAt: -1 });

export const SupplierReturnModel: Model<SupplierReturn> =
  (mongoose.models.SupplierReturn as Model<SupplierReturn> | undefined) ??
  mongoose.model<SupplierReturn>("SupplierReturn", supplierReturnSchema);
