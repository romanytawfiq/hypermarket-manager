import { describe, it, expect, beforeAll } from "vitest";
import {
  getAccountingOverview,
} from "@/services/accounting.service";
import { createCategory, createProduct } from "@/services/catalog.service";
import { receivePurchaseStock } from "@/services/inventory.service";
import { createSupplier } from "@/services/supplier.service";
import { createCustomer } from "@/services/customer.service";
import { createPurchase } from "@/services/purchasing.service";
import { openShift } from "@/services/shift.service";
import { createSale } from "@/services/sales.service";
import { createExpenseCategory, createExpense } from "@/services/expense.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

describe("accounting overview (Phase 6) — read layer over real transactions", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;
  let cashier: Awaited<ReturnType<typeof buildAuthUser>>;
  let productId: string;
  let supplierId: string;
  let customerId: string;
  // Snapshot: cost 10, price 30.
  const COST = 10;
  const PRICE = 30;

  beforeAll(async () => {
    await resetDb();
    manager = await buildAuthUser(await createUser({ username: "mgr-acc", role: "MANAGER" }));
    cashier = await buildAuthUser(await createUser({ username: "cash-acc", role: "CASHIER" }));

    const cat = await createCategory(manager, { name: "مشتريات" });
    const p = await createProduct(manager, {
      name: "منتج",
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: COST,
      sellingPrice: PRICE,
      minimumStock: 0,
    });
    productId = p.id;
    await receivePurchaseStock(
      manager,
      [{ productId, productName: "منتج", quantity: 200, trackExpiry: false }],
      {},
    );

    const supplier = await createSupplier(manager, { name: "مورد" });
    supplierId = supplier.id;

    const cust = await createCustomer(manager, { name: "عميل" });
    customerId = cust.id;

    await openShift(cashier, { openingCash: 0 });
    await openShift(manager, { openingCash: 0 });
  });

  it("requires accounting.read (a cashier is FORBIDDEN)", async () => {
    let caught: unknown;
    try {
      await getAccountingOverview(cashier);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeTruthy();
  });

  it("reports correct sales, purchases, expenses, profit, balances and cash flow", async () => {
    // ---- Purchases ----
    // Credit purchase: 10 x 5 = 50 -> increases supplier payable.
    await createPurchase(manager, {
      supplierId,
      items: [{ productId, quantity: 10, cost: 5 }],
    });
    // Cash (paid immediately) purchase: 8 x 5 = 40 -> cash paid to supplier, no payable.
    await createPurchase(manager, {
      supplierId,
      paidImmediately: true,
      items: [{ productId, quantity: 8, cost: 5 }],
    });

    // ---- Sales ----
    // Cash sale: qty 2 -> 60 cash.
    await createSale(cashier, {
      items: [{ productId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 60 }],
      idempotencyKey: crypto.randomUUID(),
    });
    // Card sale: qty 1 -> 30 via VISA (non-cash).
    await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "VISA", amount: 30 }],
      idempotencyKey: crypto.randomUUID(),
    });
    // Credit sale: qty 1 -> 30 on account (receivable).
    await createSale(manager, {
      items: [{ productId, quantity: 1 }],
      payments: [],
      customerId,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });

    // ---- Expenses ----
    for (const [amount, method] of [[50, "CASH"], [20, "VISA"]] as const) {
      const cat = await createExpenseCategory(manager, { name: `فئة ${Math.random().toString(36).slice(2, 6)}` });
      await createExpense(manager, {
        categoryId: cat.id,
        amount,
        paymentMethod: method,
        idempotencyKey: crypto.randomUUID(),
      });
    }

    const o = await getAccountingOverview(manager);

    // Sales: 60 + 30 + 30 = 120; collected at register: 60 + 30 = 90.
    expect(o.sales.total).toBe(120);
    expect(o.sales.collected).toBe(90);
    expect(o.sales.count).toBe(3);

    // Purchases: 50 + 40 = 90; cash paid to supplier = 40.
    expect(o.purchases.total).toBe(90);
    expect(o.purchases.cashPaid).toBe(40);

    // Expenses: 50 + 20 = 70; cash = 50.
    expect(o.expenses.total).toBe(70);
    expect(o.expenses.cash).toBe(50);
    expect(o.expenses.count).toBe(2);

    // COGS = 10 cost x (2+1+1) = 40. grossProfit = 120 - 40 = 80. net = 80 - 70 = 10.
    expect(o.grossProfit).toBe(80);
    expect(o.netProfit).toBe(10);

    // Balances: receivable 30 (credit sale), payable 50 (credit purchase).
    expect(o.receivable).toBe(30);
    expect(o.payable).toBe(50);

    // Physical cash flow: in = cash sale 60; out = supplier cash 40 + cash expenses 50.
    expect(o.cashIn).toBe(60);
    expect(o.cashOut).toBe(90);
    expect(o.netCashFlow).toBe(-30);

    // Payment-method breakdown: CASH 60, VISA 30.
    expect(o.salesByMethod.CASH).toBe(60);
    expect(o.salesByMethod.VISA).toBe(30);
    expect(o.salesByMethod.INSTAPAY).toBe(0);
  });
});
