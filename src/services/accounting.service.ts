import { dbConnect } from "@/lib/db";
import { requirePermission } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { SaleModel } from "@/models/sale";
import { PurchaseModel } from "@/models/purchase";
import { SupplierPaymentModel } from "@/models/supplier-payment";
import { CustomerPaymentModel } from "@/models/customer-payment";
import { CustomerLedgerModel } from "@/models/customer-ledger";
import { SupplierLedgerModel } from "@/models/supplier-ledger";
import { ExpenseModel } from "@/models/expense";
import { CashMovementModel } from "@/models/cash-movement";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/sales/constants";

/**
 * Accounting overview (Phase 6).
 *
 * A read-only analysis layer over the real, persisted financial transactions.
 * It introduces NO second ledger — every figure is aggregated live from the
 * existing sale / purchase / expense / payment / ledger / movement records so
 * the numbers always agree with the source of truth (architecture §27).
 *
 * Cash flow strictly separates physical cash (CASH) from card / wallet /
 * Instapay (BR-008, §28): only `CASH` payments and CASH_IN/CASH_OUT movements
 * affect the physical-cash totals. Supplier payments are classed as cash only
 * when their method label is the Arabic cash label ("نقدي").
 *
 * Receivables / payables are current outstanding balances across all history
 * (ledger-derived). Period figures (sales, purchases, expenses, cash flow) are
 * scoped to the requested date range.
 */

/** Arabic cash payment label — must match what cash supplier payments record. */
const CASH_METHOD_LABEL = "نقدي";

export interface AccountingOverview {
  from: string | null;
  to: string | null;
  sales: { total: number; collected: number; count: number };
  purchases: { total: number; cashPaid: number; count: number };
  expenses: { total: number; cash: number; count: number };
  grossProfit: number;
  netProfit: number;
  receivable: number;
  payable: number;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  salesByMethod: Record<PaymentMethod, number>;
}

export async function getAccountingOverview(
  actor: AuthUser | null,
  opts: { dateFrom?: string; dateTo?: string } = {},
): Promise<AccountingOverview> {
  requirePermission(actor, "accounting.read");
  await dbConnect();

  let from: Date | null = null;
  let to: Date | null = null;
  if (opts.dateFrom) {
    const d = new Date(opts.dateFrom);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  if (opts.dateTo) {
    const d = new Date(opts.dateTo);
    if (!Number.isNaN(d.getTime())) {
      const endOfDay = new Date(d);
      endOfDay.setHours(23, 59, 59, 999);
      to = endOfDay;
    }
  }

  const dateMatch: Record<string, unknown> = {};
  const hasRange = Boolean(from || to);
  if (hasRange) {
    dateMatch.$gte = from ?? new Date(0);
    dateMatch.$lte = to ?? new Date(8640000000000000);
  }
  const salesMatch = hasRange ? { createdAt: dateMatch } : {};
  const purchaseMatch = hasRange ? { createdAt: dateMatch } : {};
  const expenseMatch = hasRange ? { expenseDate: dateMatch } : {};
  const movementMatch = hasRange ? { createdAt: dateMatch } : {};

  // ---- Sales ----
  const [salesAgg, cogsAgg, methodAgg] = await Promise.all([
    SaleModel.aggregate([
      { $match: salesMatch },
      { $group: { _id: null, total: { $sum: "$totalAmount" }, collected: { $sum: "$totalPaid" }, count: { $sum: 1 } } },
    ]),
    SaleModel.aggregate([
      { $match: salesMatch },
      { $unwind: "$items" },
      { $group: { _id: null, cogs: { $sum: { $multiply: ["$items.cost", "$items.quantity"] } } } },
    ]),
    SaleModel.aggregate([
      { $match: salesMatch },
      { $unwind: "$payments" },
      { $group: { _id: "$payments.method", amount: { $sum: "$payments.amount" } } },
    ]),
  ]);

  const sales = salesAgg[0]
    ? { total: round2(salesAgg[0].total), collected: round2(salesAgg[0].collected), count: salesAgg[0].count }
    : { total: 0, collected: 0, count: 0 };
  const cogs = round2(cogsAgg[0]?.cogs ?? 0);

  const salesByMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  for (const row of methodAgg) {
    if (row._id && row._id in salesByMethod) salesByMethod[row._id as PaymentMethod] = round2(row.amount);
  }

  // ---- Purchases ----
  const [purchasesAgg, supplierCashAgg] = await Promise.all([
    PurchaseModel.aggregate([
      { $match: purchaseMatch },
      { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
    SupplierPaymentModel.aggregate([
      { $match: { ...(hasRange ? { paymentDate: dateMatch } : {}), method: CASH_METHOD_LABEL } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
  ]);
  const supplierCashPaid = round2(supplierCashAgg?.[0]?.amount ?? 0);
  const purchases = purchasesAgg?.[0]
    ? { total: round2(purchasesAgg[0].total), cashPaid: supplierCashPaid, count: purchasesAgg[0].count ?? 0 }
    : { total: 0, cashPaid: supplierCashPaid, count: 0 };

  // ---- Expenses ----
  const expensesAgg = await ExpenseModel.aggregate([
    { $match: expenseMatch },
    {
      $group: {
        _id: null,
        total: { $sum: "$amount" },
        cash: { $sum: { $cond: [{ $eq: ["$paymentMethod", "CASH"] }, "$amount", 0] } },
        count: { $sum: 1 },
      },
    },
  ]);
  const expensesRaw = expensesAgg?.[0];
  const expenses = {
    total: round2(expensesRaw?.total ?? 0),
    cash: round2(expensesRaw?.cash ?? 0),
    count: expensesRaw?.count ?? 0,
  };

  // ---- Current external balances (all-time) ----
  const [receivableAgg, payableAgg] = await Promise.all([
    CustomerLedgerModel.aggregate([{ $group: { _id: null, balance: { $sum: "$amount" } } }]),
    SupplierLedgerModel.aggregate([{ $group: { _id: null, balance: { $sum: "$amount" } } }]),
  ]);
  const receivable = round2(receivableAgg?.[0]?.balance ?? 0);
  const payable = round2(payableAgg?.[0]?.balance ?? 0);

  // ---- Physical cash flow (period) ----
  const [cashInSalesAgg, customerCashAgg, cashInMoveAgg, cashOutMoveAgg] = await Promise.all([
    SaleModel.aggregate([
      { $match: salesMatch },
      { $unwind: "$payments" },
      { $match: { "payments.method": "CASH" } },
      { $group: { _id: null, amount: { $sum: "$payments.amount" } } },
    ]),
    CustomerPaymentModel.aggregate([
      { $match: { ...(hasRange ? { paymentDate: dateMatch } : {}), method: "CASH" } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    CashMovementModel.aggregate([
      { $match: { ...movementMatch, type: "CASH_IN" } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
    CashMovementModel.aggregate([
      { $match: { ...movementMatch, type: "CASH_OUT" } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
  ]);

  const cashIn = round2(
    (cashInSalesAgg?.[0]?.amount ?? 0) + (customerCashAgg?.[0]?.amount ?? 0) + (cashInMoveAgg?.[0]?.amount ?? 0),
  );
  const cashOut = round2(
    supplierCashPaid + expenses.cash + (cashOutMoveAgg?.[0]?.amount ?? 0),
  );

  const grossProfit = round2(sales.total - cogs);
  const netProfit = round2(grossProfit - expenses.total);

  return {
    from: from ? from.toISOString() : null,
    to: to ? to.toISOString() : null,
    sales,
    purchases,
    expenses,
    grossProfit,
    netProfit,
    receivable,
    payable,
    cashIn,
    cashOut,
    netCashFlow: round2(cashIn - cashOut),
    salesByMethod,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
