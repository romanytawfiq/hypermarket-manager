import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/sales/constants";

/**
 * Supplier payment.
 *
 * Records money paid to a supplier. The payment is immutable historical data
 * (BR-017) and always produces a negative ledger entry for the supplier,
 * reducing the outstanding payable balance.
 *
 * `method` reuses the shared POS payment-method set so supplier payments
 * aggregate consistently with sales / expenses / customer payments. `idempotencyKey`
 * (unique, sparse) protects against duplicate posting on retry/double-click.
 */
export interface SupplierPayment {
  supplier: mongoose.Types.ObjectId;
  amount: number;
  /** Reuses the shared POS payment-method set (BR-008, no second payment impl). */
  method: PaymentMethod;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
  /** Payment date (defaults to creation time). */
  paymentDate: Date;
  idempotencyKey?: string;
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
    method: { type: String, enum: PAYMENT_METHODS, required: true, default: "CASH" },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
    paymentDate: { type: Date, default: () => new Date() },
    idempotencyKey: {
      type: String,
      index: { unique: true, sparse: true },
    },
  },
  { timestamps: true },
);

supplierPaymentSchema.index({ supplier: 1, paymentDate: -1 });
supplierPaymentSchema.index({ paymentDate: -1 });

export const SupplierPaymentModel: Model<SupplierPayment> =
  (mongoose.models.SupplierPayment as Model<SupplierPayment> | undefined) ??
  mongoose.model<SupplierPayment>("SupplierPayment", supplierPaymentSchema);
