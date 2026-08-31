import mongoose, { type Model } from "mongoose";

/**
 * Append-only customer ledger entry (Phase 5).
 *
 * The authoritative, immutable history of a customer's financial activity.
 * Balances are derived as the sum of ledger amounts (BR-001/BR-002, BR-012,
 * architecture §6 "ledger-derived balances"). Entries are never mutated or
 * deleted; corrections are represented by new entries with a signed amount.
 *
 * Amount sign convention:
 *  - positive  -> money owed by the customer (adds to receivable): credit sales
 *  - negative  -> money received from / credited to the customer (reduces
 *                 receivable): payments and adjustments
 *
 * The current outstanding receivable balance for a customer =
 *   sum(ledger amounts) over all entries for that customer.
 */
export const CUSTOMER_LEDGER_TYPES = [
  "CREDIT_SALE",
  "PAYMENT",
  "ADJUSTMENT",
] as const;
export type CustomerLedgerType = (typeof CUSTOMER_LEDGER_TYPES)[number];

export interface CustomerLedger {
  customer: mongoose.Types.ObjectId;
  type: CustomerLedgerType;
  /** Signed amount (positive = increases receivable). */
  amount: number;
  /** Optional foreign reference to the origin document (sale / payment). */
  referenceType?: string;
  referenceId?: string;
  /** Short Arabic description of the entry. */
  description?: string;
  createdAt: Date;
}

export type CustomerLedgerDocument = CustomerLedger & { _id: mongoose.Types.ObjectId };

const customerLedgerSchema = new mongoose.Schema<CustomerLedger>(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    type: { type: String, enum: CUSTOMER_LEDGER_TYPES, required: true },
    amount: { type: Number, required: true },
    referenceType: { type: String },
    referenceId: { type: String },
    description: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Balance derivation + statement queries.
customerLedgerSchema.index({ customer: 1, createdAt: 1 });

export const CustomerLedgerModel: Model<CustomerLedger> =
  (mongoose.models.CustomerLedger as Model<CustomerLedger> | undefined) ??
  mongoose.model<CustomerLedger>("CustomerLedger", customerLedgerSchema);
