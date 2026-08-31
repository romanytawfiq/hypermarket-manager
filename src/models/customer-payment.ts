import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/sales/constants";

/**
 * Customer payment (Phase 5).
 *
 * Records money received from a customer against their outstanding receivable.
 * The payment is immutable historical data (BR-013) and always produces a
 * negative ledger entry for the customer, reducing the outstanding receivable.
 * A customer may pay part of an outstanding amount (BR-014).
 *
 * `idempotencyKey` (unique, sparse) protects against duplicate submission on
 * retry/double-click — the same deduplication mechanism used by Sale
 * (architecture §9).
 */
export interface CustomerPayment {
  paymentNumber: string;
  customer: mongoose.Types.ObjectId;
  amount: number;
  /** Reuses the shared POS payment-method set (BR-008, no second payment impl). */
  method: PaymentMethod;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
  paymentDate: Date;
  idempotencyKey?: string;
}

export type CustomerPaymentDocument = CustomerPayment &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const customerPaymentSchema = new mongoose.Schema<CustomerPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true, index: true },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
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

customerPaymentSchema.index({ customer: 1, paymentDate: -1 });
customerPaymentSchema.index({ paymentDate: -1 });

export const CustomerPaymentModel: Model<CustomerPayment> =
  (mongoose.models.CustomerPayment as Model<CustomerPayment> | undefined) ??
  mongoose.model<CustomerPayment>("CustomerPayment", customerPaymentSchema);
