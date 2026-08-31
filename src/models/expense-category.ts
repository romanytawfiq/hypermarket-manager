import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Expense category (Phase 6).
 *
 * Configurable buckets for classifying expenses (rent, utilities, salaries,
 * maintenance, transport, operational purchases, other). Categories are seeded
 * with sensible defaults but remain user-manageable (never hardcoded in UI).
 */
export interface ExpenseCategory {
  name: string;
  active: boolean;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
}

export type ExpenseCategoryDocument = ExpenseCategory &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const expenseCategorySchema = new mongoose.Schema<ExpenseCategory>(
  {
    name: { type: String, required: true, trim: true, unique: true, maxlength: 120 },
    active: { type: Boolean, default: true },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
  },
  { timestamps: true },
);

export const ExpenseCategoryModel: Model<ExpenseCategory> =
  (mongoose.models.ExpenseCategory as Model<ExpenseCategory> | undefined) ??
  mongoose.model<ExpenseCategory>("ExpenseCategory", expenseCategorySchema);
