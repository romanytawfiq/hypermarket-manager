import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/sales/constants";

/**
 * Expense (Phase 6).
 *
 * An expense is a persisted financial transaction — never a UI-only number.
 * It is immutable historical data; its cash effect (when paid in cash against a
 * shift) is represented through an EXPENSE cash movement so shift
 * reconciliation and the accounting cash-flow view stay consistent (BR-002).
 *
 * `idempotencyKey` (unique, sparse) protects against duplicate submission on
 * retry/double-click, mirroring the Sale/CustomerPayment mechanism.
 */
export interface Expense {
  expenseNumber: string; // "EXP-YYYYMMDD-NNNN"
  category: mongoose.Types.ObjectId; // ref ExpenseCategory
  amount: number;
  /** Reuses the shared POS payment-method set. */
  paymentMethod: PaymentMethod;
  /** Business date of the expense. */
  expenseDate: Date;
  /** Optional linked cashier shift (for cash reconciliation). */
  shift?: mongoose.Types.ObjectId; // ref CashierShift
  notes?: string;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
  idempotencyKey?: string;
}

export type ExpenseDocument = Expense &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const expenseSchema = new mongoose.Schema<Expense>(
  {
    expenseNumber: { type: String, required: true, unique: true, index: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      enum: PAYMENT_METHODS,
      required: true,
      default: "CASH",
    },
    expenseDate: { type: Date, default: () => new Date(), index: true },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashierShift",
      index: true,
    },
    notes: { type: String, trim: true, maxlength: 1000, default: "" },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
    idempotencyKey: {
      type: String,
      index: { unique: true, sparse: true },
    },
  },
  { timestamps: true },
);

expenseSchema.index({ expenseDate: -1, createdAt: -1 });
expenseSchema.index({ category: 1, expenseDate: -1 });

export const ExpenseModel: Model<Expense> =
  (mongoose.models.Expense as Model<Expense> | undefined) ??
  mongoose.model<Expense>("Expense", expenseSchema);
