import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Supplier payment.
 *
 * Records money paid to a supplier. The payment is immutable historical data
 * (BR-017) and always produces a negative ledger entry for the supplier,
 * reducing the outstanding payable balance.
 */
export interface SupplierPayment {
  supplier: mongoose.Types.ObjectId;
  amount: number;
  /** Payment method label (e.g. "نقدي" / "تحويل بنكي"). */
  method: string;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
  /** Payment date (defaults to creation time). */
  paymentDate: Date;
}

export type SupplierPaymentDocument = SupplierPayment &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const supplierPaymentSchema = new mongoose.Schema<SupplierPayment>(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    method: { type: String, required: true, default: "نقدي" },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
    paymentDate: { type: Date, default: () => new Date() },
  },
  { timestamps: true },
);

supplierPaymentSchema.index({ supplier: 1, paymentDate: -1 });
supplierPaymentSchema.index({ paymentDate: -1 });

export const SupplierPaymentModel: Model<SupplierPayment> =
  (mongoose.models.SupplierPayment as Model<SupplierPayment> | undefined) ??
  mongoose.model<SupplierPayment>("SupplierPayment", supplierPaymentSchema);
