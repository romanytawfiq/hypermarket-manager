import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Cashier shift — a cashier work session.
 *
 * A shift is opened with an opening cash amount (BR-036). At closing the
 * expected cash is derived server-side from recorded shift transactions
 * (BR-037), the actual physical cash is entered (BR-038), and the variance
 * (actual - expected) is preserved (BR-039).
 *
 * Only one active (OPEN) shift per cashier is allowed; this is enforced
 * server-side at shift open (BR / REQ-SHIFT-001..003, architecture §9).
 */
export const SHIFT_STATUS = ["OPEN", "CLOSED", "REVIEW_REQUIRED"] as const;
export type ShiftStatus = (typeof SHIFT_STATUS)[number];

export interface CashierShift {
  cashierId: mongoose.Types.ObjectId;
  /** Cashier username snapshot for readable history. */
  cashierUsername: string;
  /** Opening cash amount in the till at shift start. */
  openingCash: number;
  openedAt: Date;
  status: ShiftStatus;
  /** Derived expected cash at close time (server-computed). */
  expectedCash?: number;
  /** Actual physical cash counted at close time. */
  actualCash?: number;
  /** variance = actualCash - expectedCash. */
  variance?: number;
  /** Closing user snapshot. */
  closedBy?: { id?: string; username?: string };
  closedAt?: Date;
  /** Short note captured at closing (e.g. manager explanation). */
  closingNote?: string;
}

export type CashierShiftDocument = CashierShift &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const cashierShiftSchema = new mongoose.Schema<CashierShift>(
  {
    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    cashierUsername: { type: String, required: true },
    openingCash: { type: Number, required: true, min: 0 },
    openedAt: { type: Date, default: () => new Date() },
    status: { type: String, enum: SHIFT_STATUS, default: "OPEN", index: true },
    expectedCash: { type: Number },
    actualCash: { type: Number },
    variance: { type: Number },
    closedBy: {
      id: { type: String },
      username: { type: String },
    },
    closedAt: { type: Date },
    closingNote: { type: String, default: "" },
  },
  { timestamps: true },
);

// Find the active shift for a cashier quickly.
cashierShiftSchema.index({ cashierId: 1, status: 1, openedAt: -1 });
// Reporting over closed shifts.
cashierShiftSchema.index({ status: 1, closedAt: -1 });

export const CashierShiftModel: Model<CashierShift> =
  (mongoose.models.CashierShift as Model<CashierShift> | undefined) ??
  mongoose.model<CashierShift>("CashierShift", cashierShiftSchema);
