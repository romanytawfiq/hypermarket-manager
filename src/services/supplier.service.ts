import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { SupplierModel } from "@/models/supplier";
import { SupplierLedgerModel, type SupplierLedgerType } from "@/models/supplier-ledger";
import { SupplierPaymentModel } from "@/models/supplier-payment";
import { countPurchasesBySuppliers, listPurchasesBySupplier } from "@/services/purchasing.service";
import type { SupplierInput } from "@/lib/validations/purchasing";

/**
 * Supplier core (Phase 3).
 *
 * Supplier records plus ledger-derived balances. The outstanding payable balance
 * is computed server-side as the sum of the supplier's ledger entries —
 * never stored on the supplier and never trusted from the client (BR-001).
 */

export interface SupplierDto {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  paymentTerms: string;
  active: boolean;
  /** Derived outstanding payable balance. */
  balance: number;
  /** Number of purchases recorded for this supplier. */
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
}

function toSupplierDto(
  s: {
    _id: mongoose.Types.ObjectId | string;
    name: string;
    company?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    paymentTerms?: string;
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  },
  balance: number,
  purchaseCount: number,
): SupplierDto {
  return {
    id: s._id.toString(),
    name: s.name,
    company: s.company ?? "",
    phone: s.phone ?? "",
    email: s.email ?? "",
    address: s.address ?? "",
    notes: s.notes ?? "",
    paymentTerms: s.paymentTerms ?? "",
    active: s.active ?? true,
    balance,
    purchaseCount,
    createdAt: s.createdAt?.toISOString() ?? "",
    updatedAt: s.updatedAt?.toISOString() ?? "",
  };
}

/**
 * Computes the outstanding payable balance for suppliers.
 * Positive = amount owed to the supplier. Sums each supplier's ledger amounts.
 */
async function computeBalances(
  supplierIds: string[],
): Promise<Map<string, number>> {
  if (supplierIds.length === 0) return new Map();
  const oids = supplierIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await SupplierLedgerModel.aggregate<{
    _id: string;
    total: number;
  }>([
    { $match: { supplier: { $in: oids } } },
    { $group: { _id: "$supplier", total: { $sum: "$amount" } } },
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r._id.toString(), r.total ?? 0);
  return map;
}

async function purchaseCounts(supplierIds: string[]): Promise<Map<string, number>> {
  if (supplierIds.length === 0) return new Map();
  return countPurchasesBySuppliers(supplierIds);
}

/** Lists suppliers with derived balances. Requires `suppliers.read`. */
export async function listSuppliers(
  actor: AuthUser | null,
  activeOnly = false,
): Promise<SupplierDto[]> {
  requirePermission(actor, "suppliers.read");
  await dbConnect();
  const filter = activeOnly ? { active: true } : {};
  const suppliers = await SupplierModel.find(filter)
    .sort({ name: 1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        company?: string;
        phone?: string;
        email?: string;
        address?: string;
        notes?: string;
        paymentTerms?: string;
        active?: boolean;
        createdAt?: Date;
        updatedAt?: Date;
      }>
    >();

  const ids = suppliers.map((s) => s._id.toString());
  const [balances, counts] = await Promise.all([
    computeBalances(ids),
    purchaseCounts(ids),
  ]);

  return suppliers.map((s) =>
    toSupplierDto(s, balances.get(s._id.toString()) ?? 0, counts.get(s._id.toString()) ?? 0),
  );
}

/** Fetches a single supplier with derived balance. Requires `suppliers.read`. */
export async function getSupplier(actor: AuthUser | null, id: string): Promise<SupplierDto> {
  requirePermission(actor, "suppliers.read");
  await dbConnect();
  const supplier = await SupplierModel.findById(id).lean<{
    _id: mongoose.Types.ObjectId;
    name: string;
    company?: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    paymentTerms?: string;
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }>();
  if (!supplier) throw new AppError("NOT_FOUND", "المورد غير موجود");
  const [balance, count] = await Promise.all([
    computeBalances([id]),
    purchaseCounts([id]),
  ]);
  return toSupplierDto(supplier, balance.get(id) ?? 0, count.get(id) ?? 0);
}

/** Creates a supplier. Requires `suppliers.create`. */
export async function createSupplier(actor: AuthUser | null, input: SupplierInput): Promise<SupplierDto> {
  const authed = requirePermission(actor, "suppliers.create");
  await dbConnect();
  const supplier = await SupplierModel.create({
    name: input.name,
    company: input.company ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    notes: input.notes ?? "",
    paymentTerms: input.paymentTerms ?? "",
    active: input.active ?? true,
  });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "supplier.created",
    entity: "supplier",
    entityId: supplier._id.toString(),
    after: { name: supplier.name },
  });
  return toSupplierDto(supplier, 0, 0);
}

/** Updates a supplier. Requires `suppliers.update`. */
export async function updateSupplier(actor: AuthUser | null, id: string, input: SupplierInput): Promise<SupplierDto> {
  const authed = requirePermission(actor, "suppliers.update");
  await dbConnect();
  const supplier = await SupplierModel.findById(id);
  if (!supplier) throw new AppError("NOT_FOUND", "المورد غير موجود");

  const before = { name: supplier.name, phone: supplier.phone, active: supplier.active };
  if (input.name !== undefined) supplier.name = input.name;
  if (input.company !== undefined) supplier.company = input.company ?? "";
  if (input.phone !== undefined) supplier.phone = input.phone ?? "";
  if (input.email !== undefined) supplier.email = input.email ?? "";
  if (input.address !== undefined) supplier.address = input.address ?? "";
  if (input.notes !== undefined) supplier.notes = input.notes ?? "";
  if (input.paymentTerms !== undefined) supplier.paymentTerms = input.paymentTerms ?? "";
  if (input.active !== undefined) supplier.active = input.active;
  await supplier.save();

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "supplier.updated",
    entity: "supplier",
    entityId: supplier._id.toString(),
    before,
    after: { name: supplier.name, active: supplier.active },
  });

  const [balance, count] = await Promise.all([computeBalances([id]), purchaseCounts([id])]);
  return toSupplierDto(supplier, balance.get(id) ?? 0, count.get(id) ?? 0);
}

/** Deactivates a supplier (keeps the record). Requires `suppliers.disable`. */
export async function setSupplierActive(actor: AuthUser | null, id: string, active: boolean): Promise<SupplierDto> {
  const authed = requirePermission(actor, "suppliers.disable");
  await dbConnect();
  const supplier = await SupplierModel.findById(id);
  if (!supplier) throw new AppError("NOT_FOUND", "المورد غير موجود");
  supplier.active = active;
  await supplier.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: active ? "supplier.activated" : "supplier.disabled",
    entity: "supplier",
    entityId: supplier._id.toString(),
    after: { active },
  });
  const [balance, count] = await Promise.all([computeBalances([id]), purchaseCounts([id])]);
  return toSupplierDto(supplier, balance.get(id) ?? 0, count.get(id) ?? 0);
}

/* ---- Ledger / history ---- */

export interface SupplierLedgerDto {
  id: string;
  type: SupplierLedgerType;
  amount: number;
  description: string;
  referenceId: string;
  createdAt: string;
}

/** Lists a supplier's ledger (transaction history). Requires `suppliers.view_ledger`. */
export async function listSupplierLedger(
  actor: AuthUser | null,
  supplierId: string,
): Promise<SupplierLedgerDto[]> {
  requirePermission(actor, "suppliers.view_ledger");
  await dbConnect();
  const rows = await SupplierLedgerModel.find({ supplier: supplierId })
    .sort({ createdAt: -1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        type: SupplierLedgerType;
        amount: number;
        description?: string;
        referenceId?: string;
        createdAt?: Date;
      }>
    >();
  return rows.map((r) => ({
    id: r._id.toString(),
    type: r.type,
    amount: r.amount,
    description: r.description ?? "",
    referenceId: r.referenceId ?? "",
    createdAt: r.createdAt?.toISOString() ?? "",
  }));
}

/** Lists a supplier's payments. Requires `supplier_payments.read`. */
export async function listSupplierPayments(
  actor: AuthUser | null,
  supplierId: string,
): Promise<
  Array<{ id: string; amount: number; method: string; paymentDate: string; createdBy: string }>
> {
  requirePermission(actor, "supplier_payments.read");
  await dbConnect();
  const rows = await SupplierPaymentModel.find({ supplier: supplierId })
    .sort({ paymentDate: -1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        amount: number;
        method: string;
        createdBy?: { id?: string; username?: string };
        paymentDate?: Date;
      }>
    >();
  return rows.map((r) => ({
    id: r._id.toString(),
    amount: r.amount,
    method: r.method,
    paymentDate: r.paymentDate?.toISOString() ?? "",
    createdBy: r.createdBy?.username ?? "",
  }));
}

/** Lists a supplier's purchases. Requires `purchases.read`. */
export async function listSupplierPurchases(
  actor: AuthUser | null,
  supplierId: string,
): Promise<Awaited<ReturnType<typeof listPurchasesBySupplier>>> {
  requirePermission(actor, "purchases.read");
  return listPurchasesBySupplier(actor, supplierId);
}
