import mongoose, { type Model } from "mongoose";

/**
 * Append-only supplier ledger entry.
 *
 * The authoritative, immutable history of a supplier's financial activity.
 * Balances are derived as the sum of ledger amounts (BR-001/BR-002,
 * architecture §6 "ledger-derived balances"). Entries are never mutated or
 * deleted; corrections are represented by new entries with a signed amount.
 *
 * Amount sign convention:
 *  - positive  -> money owed TO the supplier (adds to payable): purchases
 *  - negative  -> money paid to / credited by the supplier (reduces payable):
 *                 payments and returns
 *
 * The current outstanding payable balance for a supplier =
 *   sum(ledger amounts) over all entries for that supplier.
 */
export const SUPPLIER_LEDGER_TYPES = [
  "PURCHASE",
  "PAYMENT",
  "RETURN",
  "ADJUSTMENT",
] as const;
export type SupplierLedgerType = (typeof SUPPLIER_LEDGER_TYPES)[number];

export interface SupplierLedger {
  supplier: mongoose.Types.ObjectId;
  type: SupplierLedgerType;
  /** Signed amount (positive = increases payable). */
  amount: number;
  /** Optional foreign reference to the origin document (purchase / payment / return). */
  referenceType?: string;
  referenceId?: string;
  /** Short Arabic description of the entry. */
  description?: string;
  /** Whether this entry stems from an initial cash-paid purchase (paid immediately). */
  settled?: boolean;
  createdAt: Date;
}

export type SupplierLedgerDocument = SupplierLedger & { _id: mongoose.Types.ObjectId };

const supplierLedgerSchema = new mongoose.Schema<SupplierLedger>(
  {
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
      index: true,
    },
    type: { type: String, enum: SUPPLIER_LEDGER_TYPES, required: true },
    amount: { type: Number, required: true },
    referenceType: { type: String },
    referenceId: { type: String },
    description: { type: String, default: "" },
    settled: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Balance derivation + history queries.
supplierLedgerSchema.index({ supplier: 1, createdAt: -1 });

export const SupplierLedgerModel: Model<SupplierLedger> =
  (mongoose.models.SupplierLedger as Model<SupplierLedger> | undefined) ??
  mongoose.model<SupplierLedger>("SupplierLedger", supplierLedgerSchema);
