import mongoose, { type Model, type SchemaTimestampsConfig } from "mongoose";

/**
 * Supplier (vendor).
 *
 * A supplier is a persistent record referenced by purchases, ledger entries, and
 * payments. Suppliers are never physically deleted once they have transactions —
 * they are deactivated instead, so historical documents stay intact (BR-004).
 *
 * The outstanding balance is NOT stored here; it is derived from ledger
 * transactions (BR-001/BR-002, ledger-derived balances per architecture §6).
 */
export interface Supplier {
  name: string;
  /** Company / trade name, when different from the contact name. */
  company?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  /** Payment terms / default terms for new purchases, e.g. "نقدي" / "آجل". */
  paymentTerms?: string;
  active: boolean;
}

export type SupplierDocument = Supplier &
  SchemaTimestampsConfig & { _id: mongoose.Types.ObjectId };

const supplierSchema = new mongoose.Schema<Supplier>(
  {
    name: { type: String, required: true, trim: true, index: true },
    company: { type: String, trim: true, default: "" },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    notes: { type: String, default: "" },
    paymentTerms: { type: String, default: "" },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Common operational lookup: active suppliers by name.
supplierSchema.index({ active: 1, name: 1 });

export const SupplierModel: Model<Supplier> =
  (mongoose.models.Supplier as Model<Supplier> | undefined) ??
  mongoose.model<Supplier>("Supplier", supplierSchema);
