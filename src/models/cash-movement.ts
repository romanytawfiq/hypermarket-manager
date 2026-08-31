import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Explicit cash movement associated with a cashier shift.
 *
 * Cash changes inside a shift are represented here rather than by editing the
 * till silently (BR-040..042). Direction is applied by the shift reconciliation
 * (expected-cash formula), not by a mutable balance.
 */
export const CASH_MOVEMENT_TYPES = ["CASH_IN", "CASH_OUT", "EXPENSE", "ADJUSTMENT"] as const;
export type CashMovementType = (typeof CASH_MOVEMENT_TYPES)[number];

export interface CashMovement {
  shift: mongoose.Types.ObjectId;
  type: CashMovementType;
  /** Positive magnitude. Direction is implied by the type in reconciliation. */
  amount: number;
  /** Business reason for the movement. */
  reason: string;
  /** Acting user snapshot. */
  createdBy?: { id?: string; username?: string };
}

export type CashMovementDocument = CashMovement &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const cashMovementSchema = new mongoose.Schema<CashMovement>(
  {
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CashierShift",
      required: true,
      index: true,
    },
    type: { type: String, enum: CASH_MOVEMENT_TYPES, required: true },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "" },
    createdBy: {
      id: { type: String },
      username: { type: String },
    },
  },
  { timestamps: true },
);

cashMovementSchema.index({ shift: 1, createdAt: -1 });

export const CashMovementModel: Model<CashMovement> =
  (mongoose.models.CashMovement as Model<CashMovement> | undefined) ??
  mongoose.model<CashMovement>("CashMovement", cashMovementSchema);
