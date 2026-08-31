import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Customer (Phase 5).
 *
 * A persistent record referenced by sales and customer-ledger entries. Customers
 * are never physically deleted once they have transactions — they are
 * deactivated instead, so historical documents stay intact (BR-004).
 *
 * The outstanding receivable balance is NOT stored here; it is derived from the
 * customer ledger (BR-012, BR-001/BR-002, ledger-derived balances per
 * architecture §6 and §9).
 *
 * `creditLimit` is the per-customer configurable extension ceiling
 * (architecture §25 open-decision default "none initially; configurable per
 * customer"). A null/absent limit means unlimited credit. This field is NOT a
 * cached balance — it is a policy cap enforced server-side at credit-sale time
 * (BR-011). Editing it affects only future credit sales.
 */
export interface Customer {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  /** Per-customer credit cap in EGP; null = unlimited. Server-enforced policy only. */
  creditLimit?: number | null;
  /** Whether the customer may purchase on credit (policy). */
  allowCredit: boolean;
  active: boolean;
}

export type CustomerDocument = Customer &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const customerSchema = new mongoose.Schema<Customer>(
  {
    name: { type: String, required: true, trim: true, index: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    notes: { type: String, default: "" },
    creditLimit: { type: Number, min: 0, default: null },
    allowCredit: { type: Boolean, default: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Common operational lookup: active customers by name / phone.
customerSchema.index({ active: 1, name: 1 });
customerSchema.index({ phone: 1 });

export const CustomerModel: Model<Customer> =
  (mongoose.models.Customer as Model<Customer> | undefined) ??
  mongoose.model<Customer>("Customer", customerSchema);
