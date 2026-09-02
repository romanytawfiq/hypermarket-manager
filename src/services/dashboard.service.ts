import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { can } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";
import { SaleModel } from "@/models/sale";
import { PurchaseModel } from "@/models/purchase";
import { ExpenseModel } from "@/models/expense";
import { CustomerLedgerModel } from "@/models/customer-ledger";
import { SupplierLedgerModel } from "@/models/supplier-ledger";
import { SupplierPaymentModel } from "@/models/supplier-payment";
import { ProductModel } from "@/models/product";
import { InventoryStateModel } from "@/models/inventory-state";
import { ProductBatchModel } from "@/models/product-batch";
import { CashierShiftModel } from "@/models/cashier-shift";
import { PAYMENT_METHODS, type PaymentMethod, isCashMethod } from "@/lib/sales/constants";
import { isLowStock, isOutOfStock, isExpired, isExpiringSoon, EXPIRING_SOON_DAYS } from "@/lib/inventory/stock";

export type DashboardPeriod = "today" | "week" | "month" | "custom";

export interface DashboardPeriodRange {
  label: string;
  from: Date | null;
  to: Date | null;
}

export function getPeriodRange(period: DashboardPeriod, customFrom?: string, customTo?: string): DashboardPeriodRange {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  switch (period) {
    case "today":
      return { label: "اليوم", from: todayStart, to: todayEnd };
    case "week": {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - todayStart.getDay());
      return { label: "هذا الأسبوع", from: weekStart, to: todayEnd };
    }
    case "month": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { label: "هذا الشهر", from: monthStart, to: todayEnd };
    }
    case "custom": {
      let from: Date | null = null;
      let to: Date | null = null;
      if (customFrom && customFrom.trim()) {
        const d = new Date(customFrom);
        if (!Number.isNaN(d.getTime())) from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      if (customTo && customTo.trim()) {
        const d = new Date(customTo);
        if (!Number.isNaN(d.getTime())) {
          const endOfDay = new Date(d);
          endOfDay.setHours(23, 59, 59, 999);
          to = endOfDay;
        }
      }
      return { label: "فترة مخصصة", from, to };
    }
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function buildDateMatch(from: Date | null, to: Date | null): Record<string, unknown> {
  if (!from && !to) return {};
  const match: Record<string, unknown> = {};
  if (from) match.$gte = from;
  if (to) match.$lte = to;
  return match;
}

async function getSalesSummary(from: Date | null, to: Date | null) {
  const dateMatch = buildDateMatch(from, to);
  const _salesMatch = Object.keys(dateMatch).length ? { createdAt: dateMatch } : {};

  const [salesAgg, methodAgg, itemsAgg] = await Promise.all([
    SaleModel.aggregate([
      { $match: _salesMatch },
      { $group: { _id: null, total: { $sum: "$totalAmount" }, collected: { $sum: "$totalPaid" }, count: { $sum: 1 } } },
    ]),
    SaleModel.aggregate([
      { $match: _salesMatch },
      { $unwind: "$payments" },
      { $group: { _id: "$payments.method", amount: { $sum: "$payments.amount" } } },
    ]),
    SaleModel.aggregate([
      { $match: _salesMatch },
      { $unwind: "$items" },
      { $group: { _id: "$items.productName", quantity: { $sum: "$items.quantity" }, revenue: { $sum: "$items.lineTotal" } } },
      { $sort: { quantity: -1 } },
      { $limit: 5 },
    ]),
  ]);

  const sales = salesAgg[0]
    ? { total: round2(salesAgg[0].total), collected: round2(salesAgg[0].collected), count: salesAgg[0].count }
    : { total: 0, collected: 0, count: 0 };

  const salesByMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, 0])) as Record<PaymentMethod, number>;
  for (const row of methodAgg) {
    if (row._id && row._id in salesByMethod) salesByMethod[row._id as PaymentMethod] = round2(row.amount);
  }

  const topProducts = itemsAgg.map((row) => ({
    productName: row._id,
    quantity: row.quantity,
    revenue: round2(row.revenue),
  }));

  return { sales, salesByMethod, topProducts };
}

async function getSalesTrend(_from: Date | null, _to: Date | null) {
  void _from;
  void _to;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const trendMatch = { createdAt: { $gte: sevenDaysAgo } };

  const rows = await SaleModel.find(trendMatch)
    .select("createdAt totalAmount")
    .lean<Array<{ createdAt: Date; totalAmount: number }>>();

  const byDay = new Map<string, { total: number; count: number }>();
  for (const row of rows) {
    const dayKey = row.createdAt.toISOString().split("T")[0] ?? "";
    const existing = byDay.get(dayKey) ?? { total: 0, count: 0 };
    existing.total += row.totalAmount;
    existing.count += 1;
    byDay.set(dayKey, existing);
  }

  const trend: Array<{ date: string; total: number; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0] ?? "";
    const data = byDay.get(key) ?? { total: 0, count: 0 };
    trend.push({ date: key, total: round2(data.total), count: data.count });
  }

  return trend;
}

async function getPurchaseSummary(from: Date | null, to: Date | null) {
  const dateMatch = buildDateMatch(from, to);
  const purchaseMatch = Object.keys(dateMatch).length ? { createdAt: dateMatch } : {};

  const [purchasesAgg, supplierCashAgg] = await Promise.all([
    PurchaseModel.aggregate([
      { $match: purchaseMatch },
      { $group: { _id: null, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    ]),
    SupplierPaymentModel.aggregate([
      { $match: { ...(Object.keys(dateMatch).length ? { paymentDate: dateMatch } : {}), method: "CASH" } },
      { $group: { _id: null, amount: { $sum: "$amount" } } },
    ]),
  ]);

  const supplierCashPaid = round2(supplierCashAgg?.[0]?.amount ?? 0);
  const purchases = purchasesAgg?.[0]
    ? { total: round2(purchasesAgg[0].total), cashPaid: supplierCashPaid, count: purchasesAgg[0].count ?? 0 }
    : { total: 0, cashPaid: supplierCashPaid, count: 0 };

  return purchases;
}

async function getExpenseSummary(from: Date | null, to: Date | null) {
  const dateMatch = buildDateMatch(from, to);
  const expenseMatch = Object.keys(dateMatch).length ? { expenseDate: dateMatch } : {};

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
  return {
    total: round2(expensesRaw?.total ?? 0),
    cash: round2(expensesRaw?.cash ?? 0),
    count: expensesRaw?.count ?? 0,
  };
}

async function getReceivablesSummary() {
  const agg = await CustomerLedgerModel.aggregate([{ $group: { _id: null, balance: { $sum: "$amount" } } }]);
  const total = round2(agg?.[0]?.balance ?? 0);

  const customerCountAgg = await CustomerLedgerModel.aggregate([
    { $group: { _id: "$customer", balance: { $sum: "$amount" } } },
    { $match: { balance: { $gt: 0 } } },
    { $count: "count" },
  ]);
  const customerCount = customerCountAgg?.[0]?.count ?? 0;

  return { total, customerCount };
}

async function getPayablesSummary() {
  const agg = await SupplierLedgerModel.aggregate([{ $group: { _id: null, balance: { $sum: "$amount" } } }]);
  const total = round2(agg?.[0]?.balance ?? 0);

  const supplierCountAgg = await SupplierLedgerModel.aggregate([
    { $group: { _id: "$supplier", balance: { $sum: "$amount" } } },
    { $match: { balance: { $gt: 0 } } },
    { $count: "count" },
  ]);
  const supplierCount = supplierCountAgg?.[0]?.count ?? 0;

  return { total, supplierCount };
}

async function getInventoryAlerts() {
  const products = await ProductModel.find({ active: true })
    .select("name minimumStock trackExpiry")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string; minimumStock: number; trackExpiry: boolean }>>();

  const productIds = products.map((p) => p._id);
  const [states, batches] = await Promise.all([
    InventoryStateModel.find({ product: { $in: productIds } }).lean<Array<{ product: mongoose.Types.ObjectId; onHand: number; nonSellable: number }>>(),
    ProductBatchModel.find({ product: { $in: productIds }, quantity: { $gt: 0 } })
      .select("product quantity expiryDate")
      .lean<Array<{ product: mongoose.Types.ObjectId; quantity: number; expiryDate: Date }>>(),
  ]);

  const stateMap = new Map(states.map((s) => [s.product.toString(), s]));
  const batchMap = new Map<string, number>();
  const now = new Date();
  let expiringCount = 0;
  let expiredCount = 0;

  for (const b of batches) {
    const pid = b.product.toString();
    if (isExpired(b.expiryDate, now)) {
      expiredCount++;
    } else if (isExpiringSoon(b.expiryDate, EXPIRING_SOON_DAYS, now)) {
      expiringCount++;
      batchMap.set(pid, (batchMap.get(pid) ?? 0) + b.quantity);
    } else {
      batchMap.set(pid, (batchMap.get(pid) ?? 0) + b.quantity);
    }
  }

  let lowStockCount = 0;
  let outOfStockCount = 0;
  let replenishmentCount = 0;

  for (const p of products) {
    const pid = p._id.toString();
    const state = stateMap.get(pid);
    const sellable = p.trackExpiry ? (batchMap.get(pid) ?? 0) : (state?.onHand ?? 0);

    if (isOutOfStock(sellable)) outOfStockCount++;
    else if (isLowStock(sellable, p.minimumStock)) lowStockCount++;

    if (sellable < p.minimumStock) replenishmentCount++;
  }

  return { lowStockCount, outOfStockCount, expiringCount, expiredCount, replenishmentCount };
}

async function getActiveShiftForCashier(cashierId: string) {
  const shift = await CashierShiftModel.findOne({ cashierId, status: "OPEN" })
    .select("_id openingCash openedAt")
    .lean<{ _id: mongoose.Types.ObjectId; openingCash: number; openedAt: Date }>();
  if (!shift) return null;

  const sales = await SaleModel.find({ shift: shift._id })
    .select("payments totalAmount")
    .lean<Array<{ payments: Array<{ method: PaymentMethod; amount: number }>; totalAmount: number }>>();

  let cashSales = 0;
  for (const s of sales) {
    for (const p of s.payments) {
      if (isCashMethod(p.method)) cashSales += p.amount;
    }
  }

  return {
    id: shift._id.toString(),
    openingCash: shift.openingCash,
    openedAt: shift.openedAt.toISOString(),
    salesCount: sales.length,
    cashSales: round2(cashSales),
  };
}

export interface DashboardData {
  period: DashboardPeriodRange;
  // Sales
  sales: { total: number; collected: number; count: number } | null;
  salesByMethod: Record<PaymentMethod, number> | null;
  topProducts: Array<{ productName: string; quantity: number; revenue: number }> | null;
  salesTrend: Array<{ date: string; total: number; count: number }> | null;
  // Purchases
  purchases: { total: number; cashPaid: number; count: number } | null;
  // Expenses
  expenses: { total: number; cash: number; count: number } | null;
  // Receivables / Payables
  receivables: { total: number; customerCount: number } | null;
  payables: { total: number; supplierCount: number } | null;
  // Profit (requires accounting.read)
  grossProfit: number | null;
  netProfit: number | null;
  // Inventory
  inventoryAlerts: { lowStockCount: number; outOfStockCount: number; expiringCount: number; expiredCount: number; replenishmentCount: number } | null;
  // Cashier shift
  activeShift: { id: string; openingCash: number; openedAt: string; salesCount: number; cashSales: number } | null;
}

export async function getDashboardData(
  actor: AuthUser,
  period: DashboardPeriod = "today",
  customFrom?: string,
  customTo?: string
): Promise<DashboardData> {
  await dbConnect();

  const periodRange = getPeriodRange(period, customFrom ?? "", customTo ?? "");
  const { from, to } = periodRange;

  const canViewSales = can(actor, "sales.read");
  const canViewPurchases = can(actor, "purchases.read");
  const canViewExpenses = can(actor, "expenses.read");
  const canViewAccounting = can(actor, "accounting.read");
  const canViewCustomers = can(actor, "customers.view_ledger");
  const canViewSuppliers = can(actor, "suppliers.view_ledger");
  const canViewInventory = can(actor, "inventory.read");
  const canViewShifts = can(actor, "shifts.read");

  const [
    salesData,
    salesTrend,
    purchases,
    expenses,
    receivables,
    payables,
    inventoryAlerts,
    activeShift,
  ] = await Promise.all([
    canViewSales ? getSalesSummary(from, to) : Promise.resolve(null),
    canViewSales ? getSalesTrend(from, to) : Promise.resolve(null),
    canViewPurchases ? getPurchaseSummary(from, to) : Promise.resolve(null),
    canViewExpenses ? getExpenseSummary(from, to) : Promise.resolve(null),
    (canViewCustomers || canViewAccounting) ? getReceivablesSummary() : Promise.resolve(null),
    (canViewSuppliers || canViewAccounting) ? getPayablesSummary() : Promise.resolve(null),
    canViewInventory ? getInventoryAlerts() : Promise.resolve(null),
    (canViewShifts && actor.role === "CASHIER") ? getActiveShiftForCashier(actor.id) : Promise.resolve(null),
  ]);

  let grossProfit: number | null = null;
  let netProfit: number | null = null;
  if (canViewAccounting && salesData) {
    const cogsAgg = await SaleModel.aggregate([
      { $match: Object.keys(buildDateMatch(from, to)).length ? { createdAt: buildDateMatch(from, to) } : {} },
      { $unwind: "$items" },
      { $group: { _id: null, cogs: { $sum: { $multiply: ["$items.cost", "$items.quantity"] } } } },
    ]);
    const cogs = round2(cogsAgg[0]?.cogs ?? 0);
    grossProfit = round2(salesData.sales.total - cogs);
    netProfit = round2(grossProfit - (expenses?.total ?? 0));
  }

  return {
    period: periodRange,
    sales: salesData?.sales ?? null,
    salesByMethod: salesData?.salesByMethod ?? null,
    topProducts: salesData?.topProducts ?? null,
    salesTrend: salesTrend ?? null,
    purchases: purchases ?? null,
    expenses: expenses ?? null,
    receivables: receivables ?? null,
    payables: payables ?? null,
    grossProfit,
    netProfit,
    inventoryAlerts: inventoryAlerts ?? null,
    activeShift: activeShift ?? null,
  };
}