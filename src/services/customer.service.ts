import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { dbConnect, withTransaction } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { recordAudit } from "@/services/audit.service";
import { CustomerModel } from "@/models/customer";
import { CustomerLedgerModel, type CustomerLedgerType } from "@/models/customer-ledger";
import { CustomerPaymentModel } from "@/models/customer-payment";
import { dayKeyedNumber } from "@/models/sequence";
import { paymentMethodLabel, type PaymentMethod } from "@/lib/sales/constants";
import { escapeRegExp } from "@/lib/utils";
import type { CustomerInput, CustomerPaymentInput } from "@/lib/validations/customers";

/**
 * Customer core (Phase 5).
 *
 * Customer records plus ledger-derived receivable balances. The outstanding
 * receivable balance is computed server-side as the sum of the customer's
 * ledger entries — never stored on the customer and never trusted from the
 * client (BR-001, BR-012).
 */

export interface CustomerDto {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  creditLimit: number | null;
  allowCredit: boolean;
  active: boolean;
  /** Derived outstanding receivable balance (>= 0). */
  balance: number;
  /** Number of credit sales recorded for this customer. */
  saleCount: number;
  createdAt: string;
  updatedAt: string;
}

function toCustomerDto(
  c: {
    _id: mongoose.Types.ObjectId | string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    notes?: string;
    creditLimit?: number | null;
    allowCredit?: boolean;
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  },
  balance: number,
  saleCount: number,
): CustomerDto {
  return {
    id: c._id.toString(),
    name: c.name,
    phone: c.phone ?? "",
    email: c.email ?? "",
    address: c.address ?? "",
    notes: c.notes ?? "",
    creditLimit: c.creditLimit ?? null,
    allowCredit: c.allowCredit ?? true,
    active: c.active ?? true,
    balance: Math.max(0, balance),
    saleCount,
    createdAt: c.createdAt?.toISOString() ?? "",
    updatedAt: c.updatedAt?.toISOString() ?? "",
  };
}

type CustomerLean = {
  _id: mongoose.Types.ObjectId;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  creditLimit?: number | null;
  allowCredit?: boolean;
  active?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

const CUSTOMER_FIELDS =
  "_id name phone email address notes creditLimit allowCredit active createdAt updatedAt";

/**
 * Computes the outstanding receivable balance for customers (sum of ledger
 * amounts; a customer balance is never negative in practice, but defensively we
 * floor at 0 at the DTO boundary).
 */
async function computeBalances(customerIds: string[]): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map();
  const oids = customerIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await CustomerLedgerModel.aggregate<{
    _id: string;
    total: number;
  }>([
    { $match: { customer: { $in: oids } } },
    { $group: { _id: "$customer", total: { $sum: "$amount" } } },
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r._id.toString(), r.total ?? 0);
  return map;
}

const SALE_STATE_TYPES: readonly CustomerLedgerType[] = ["CREDIT_SALE"];

async function saleCounts(customerIds: string[]): Promise<Map<string, number>> {
  if (customerIds.length === 0) return new Map();
  const oids = customerIds.map((id) => new mongoose.Types.ObjectId(id));
  const rows = await CustomerLedgerModel.aggregate<{ _id: string; total: number }>([
    { $match: { customer: { $in: oids }, type: { $in: SALE_STATE_TYPES } } },
    { $group: { _id: "$customer", total: { $sum: 1 } } },
  ]);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r._id.toString(), r.total ?? 0);
  return map;
}

/** Fetches a customer by id (raw). Throws when not found. */
async function loadCustomer(id: string): Promise<CustomerLean> {
  const customer = await CustomerModel.findById(id)
    .select(CUSTOMER_FIELDS)
    .lean<CustomerLean>();
  if (!customer) throw new AppError("NOT_FOUND", "العميل غير موجود");
  return customer;
}

/** Lists customers with derived balances. Requires `customers.read`. */
export async function listCustomers(
  actor: AuthUser | null,
  opts: { activeOnly?: boolean } = {},
): Promise<CustomerDto[]> {
  requirePermission(actor, "customers.read");
  await dbConnect();
  const filter = opts.activeOnly ? { active: true } : {};
  const customers = await CustomerModel.find(filter)
    .sort({ name: 1 })
    .select(CUSTOMER_FIELDS)
    .lean<CustomerLean[]>();

  const ids = customers.map((c) => c._id.toString());
  const [balances, counts] = await Promise.all([computeBalances(ids), saleCounts(ids)]);
  return customers.map((c) =>
    toCustomerDto(c, balances.get(c._id.toString()) ?? 0, counts.get(c._id.toString()) ?? 0),
  );
}

/** Fetches a single customer with derived balance. Requires `customers.read`. */
export async function getCustomer(actor: AuthUser | null, id: string): Promise<CustomerDto> {
  requirePermission(actor, "customers.read");
  await dbConnect();
  const customer = await loadCustomer(id);
  const [balance, count] = await Promise.all([
    computeBalances([id]),
    saleCounts([id]),
  ]);
  return toCustomerDto(customer, balance.get(id) ?? 0, count.get(id) ?? 0);
}

/** Creates a customer. Requires `customers.create`. */
export async function createCustomer(actor: AuthUser | null, input: CustomerInput): Promise<CustomerDto> {
  const authed = requirePermission(actor, "customers.create");
  await dbConnect();
  const customer = await CustomerModel.create({
    name: input.name,
    phone: input.phone ?? "",
    email: input.email ?? "",
    address: input.address ?? "",
    notes: input.notes ?? "",
    creditLimit: input.creditLimit ?? null,
    allowCredit: input.allowCredit ?? true,
    active: input.active ?? true,
  });
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "customer.created",
    entity: "customer",
    entityId: customer._id.toString(),
    after: { name: customer.name, allowCredit: customer.allowCredit },
  });
  return toCustomerDto(customer, 0, 0);
}

/** Updates a customer. Requires `customers.update`. */
export async function updateCustomer(actor: AuthUser | null, id: string, input: CustomerInput): Promise<CustomerDto> {
  const authed = requirePermission(actor, "customers.update");
  await dbConnect();
  const customer = await CustomerModel.findById(id);
  if (!customer) throw new AppError("NOT_FOUND", "العميل غير موجود");

  const before = { name: customer.name, phone: customer.phone, active: customer.active };
  if (input.name !== undefined) customer.name = input.name;
  if (input.phone !== undefined) customer.phone = input.phone ?? "";
  if (input.email !== undefined) customer.email = input.email ?? "";
  if (input.address !== undefined) customer.address = input.address ?? "";
  if (input.notes !== undefined) customer.notes = input.notes ?? "";
  if (input.creditLimit !== undefined) customer.creditLimit = input.creditLimit ?? null;
  if (input.allowCredit !== undefined) customer.allowCredit = input.allowCredit;
  if (input.active !== undefined) customer.active = input.active;
  await customer.save();

  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: "customer.updated",
    entity: "customer",
    entityId: customer._id.toString(),
    before,
    after: { name: customer.name, active: customer.active },
  });

  const [balance, count] = await Promise.all([computeBalances([id]), saleCounts([id])]);
  return toCustomerDto(customer, balance.get(id) ?? 0, count.get(id) ?? 0);
}

/** Deactivates a customer (keeps the record). Requires `customers.disable`. */
export async function setCustomerActive(actor: AuthUser | null, id: string, active: boolean): Promise<CustomerDto> {
  const authed = requirePermission(actor, "customers.disable");
  await dbConnect();
  const customer = await CustomerModel.findById(id);
  if (!customer) throw new AppError("NOT_FOUND", "العميل غير موجود");
  customer.active = active;
  await customer.save();
  await recordAudit({
    actorId: authed.id,
    actorUsername: authed.username,
    action: active ? "customer.activated" : "customer.disabled",
    entity: "customer",
    entityId: customer._id.toString(),
    after: { active },
  });
  const [balance, count] = await Promise.all([computeBalances([id]), saleCounts([id])]);
  return toCustomerDto(customer, balance.get(id) ?? 0, count.get(id) ?? 0);
}

/* ---- POS customer lookup ---- */

/** Lightweight POS result for on-account sales (id + name + balance). */
export interface PosCustomerDto {
  id: string;
  name: string;
  phone: string;
  allowCredit: boolean;
  /** Derived outstanding receivable balance. */
  balance: number;
}

/**
 * POS customer search by name / phone. Scoped to `customers.credit` so a
 * cashier completing on-account sales can find a customer without needing a
 * broader read permission (mirrors the posSearchProducts pattern).
 */
export async function posSearchCustomers(
  actor: AuthUser | null,
  query: string,
): Promise<PosCustomerDto[]> {
  requirePermission(actor, "customers.credit");
  await dbConnect();
  const q = query.trim();
  if (!q) return [];

  const re = new RegExp(escapeRegExp(q), "i");
  const customers = await CustomerModel.find({
    active: true,
    $or: [{ name: { $regex: re } }, { phone: { $regex: re } }],
  })
    .sort({ name: 1 })
    .limit(15)
    .select("_id name phone allowCredit")
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        name: string;
        phone?: string;
        allowCredit?: boolean;
      }>
    >();

  const balances = await computeBalances(customers.map((c) => c._id.toString()));
  return customers.map((c) => ({
    id: c._id.toString(),
    name: c.name,
    phone: c.phone ?? "",
    allowCredit: c.allowCredit ?? true,
    balance: Math.max(0, balances.get(c._id.toString()) ?? 0),
  }));
}

/* ---- Customer payment ---- */

const PAYMENT_PREFIX = "PYMT";

/**
 * Records a customer payment and reduces their receivable. The payment is
 * immutable (BR-013) and always produces a negative ledger entry (BR-012).
 * Idempotent via the client `idempotencyKey` (unique index) so retries never
 * double-collect. Uses the shared POS payment-method set.
 */
export async function createCustomerPayment(
  actor: AuthUser | null,
  input: CustomerPaymentInput,
): Promise<{ id: string; paymentNumber: string; amount: number }> {
  const authed = requirePermission(actor, "customer_payments.create");
  await dbConnect();
  const customer = await loadCustomer(input.customerId);
  if (!customer.active) {
    throw new AppError("CONFLICT", "لا يمكن تحصيل دفعة من عميل غير نشط");
  }

  return withTransaction(async (session) => {
    // Idempotency: replaying the same key returns the existing payment.
    if (input.idempotencyKey) {
      const existing = await CustomerPaymentModel.findOne({
        idempotencyKey: input.idempotencyKey,
      })
        .session(session)
        .lean();
      if (existing) {
        return {
          id: existing._id.toString(),
          paymentNumber: existing.paymentNumber,
          amount: existing.amount,
        };
      }
    }

    const now = new Date();
    const paymentNumber = await dayKeyedNumber(PAYMENT_PREFIX, "customer-payment", session, now);

    const [payment] = await CustomerPaymentModel.create(
      [
        {
          paymentNumber,
          customer: customer._id,
          amount: input.amount,
          method: input.method,
          createdBy: { id: authed.id, username: authed.username },
          idempotencyKey: input.idempotencyKey,
        },
      ],
      { session },
    );
    if (!payment) throw new AppError("INTERNAL", "حدث خطأ غير متوقع أثناء تسجيل الدفعة");

    await CustomerLedgerModel.create(
      [
        {
          customer: customer._id,
          type: "PAYMENT",
          amount: -input.amount,
          referenceType: "PAYMENT",
          referenceId: payment._id.toString(),
          description: `دفعة من العميل (${paymentMethodLabel(input.method)})`,
        },
      ],
      { session },
    );

    await recordAudit({
      actorId: authed.id,
      actorUsername: authed.username,
      action: "customer.payment",
      entity: "customer",
      entityId: customer._id.toString(),
      after: {
        paymentId: payment._id.toString(),
        paymentNumber,
        amount: input.amount,
        method: input.method,
      },
    });

    return {
      id: payment._id.toString(),
      paymentNumber: payment.paymentNumber,
      amount: payment.amount,
    };
  });
}

/* ---- Ledger / statement ---- */

export interface CustomerLedgerDto {
  id: string;
  type: CustomerLedgerType;
  amount: number;
  description: string;
  referenceId: string;
  createdAt: string;
}

/** Lists a customer's ledger (statement, oldest first). Requires `customers.view_ledger`. */
export async function listCustomerLedger(
  actor: AuthUser | null,
  customerId: string,
): Promise<CustomerLedgerDto[]> {
  requirePermission(actor, "customers.view_ledger");
  await dbConnect();
  const rows = await CustomerLedgerModel.find({ customer: customerId })
    .sort({ createdAt: 1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        type: CustomerLedgerType;
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

/* ---- Payments ---- */

export interface CustomerPaymentDto {
  id: string;
  paymentNumber: string;
  amount: number;
  method: string;
  paymentDate: string;
  createdBy: string;
}

/** Lists a customer's payments (newest first). Requires `customer_payments.read`. */
export async function listCustomerPayments(
  actor: AuthUser | null,
  customerId: string,
): Promise<CustomerPaymentDto[]> {
  requirePermission(actor, "customer_payments.read");
  await dbConnect();
  const rows = await CustomerPaymentModel.find({ customer: customerId })
    .sort({ paymentDate: -1 })
    .lean<
      Array<{
        _id: mongoose.Types.ObjectId;
        paymentNumber: string;
        amount: number;
        method: PaymentMethod;
        paymentDate?: Date;
        createdBy?: { id?: string; username?: string };
      }>
    >();
  return rows.map((r) => ({
    id: r._id.toString(),
    paymentNumber: r.paymentNumber,
    amount: r.amount,
    method: r.method,
    paymentDate: r.paymentDate?.toISOString() ?? "",
    createdBy: r.createdBy?.username ?? "",
  }));
}

/** Re-export methods for UI labels. */
export { paymentMethodLabel, type PaymentMethod };
