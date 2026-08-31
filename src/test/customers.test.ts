import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createCustomer,
  updateCustomer,
  setCustomerActive,
  listCustomers,
  getCustomer,
  posSearchCustomers,
  createCustomerPayment,
  listCustomerLedger,
  listCustomerPayments,
} from "@/services/customer.service";
import { createSale } from "@/services/sales.service";
import { openShift } from "@/services/shift.service";
import {
  createProduct,
  createCategory,
} from "@/services/catalog.service";
import { receivePurchaseStock } from "@/services/inventory.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

async function managerActor() {
  const m = await createUser({ username: "mgr5", role: "MANAGER" });
  return buildAuthUser(m);
}

async function cashierActor(username: string) {
  const c = await createUser({ username, role: "CASHIER" });
  return buildAuthUser(c);
}

describe("Customer credit & receivables (Phase 5)", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;

  beforeAll(async () => {
    await resetDb();
    manager = await managerActor();
  });

  async function makeProduct(name: string, sellingPrice: number, stock: number): Promise<string> {
    const cat = await createCategory(manager, { name: `فئة ${name}` });
    const p = await createProduct(manager, {
      name,
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: Math.floor(sellingPrice / 2),
      sellingPrice,
      minimumStock: 0,
      trackExpiry: false,
    });
    await receivePurchaseStock(
      manager,
      [{ productId: p.id, productName: name, quantity: stock, trackExpiry: false }],
      {},
    );
    return p.id;
  }

  it("creates, updates, and lists customers (manager); rejects without permission", async () => {
    const customer = await createCustomer(manager, {
      name: "منى",
      phone: "0100",
      creditLimit: 1000,
      allowCredit: true,
    });
    expect(customer.balance).toBe(0);
    expect(customer.creditLimit).toBe(1000);
    expect(customer.active).toBe(true);

    const updated = await updateCustomer(manager, customer.id, {
      name: "منى محمد",
      allowCredit: false,
    });
    expect(updated.name).toBe("منى محمد");
    expect(updated.allowCredit).toBe(false);

    const listed = await listCustomers(manager);
    expect(listed.some((c) => c.id === customer.id)).toBe(true);
  });

  it("deactivates a customer without deleting the record", async () => {
    const customer = await createCustomer(manager, { name: "مؤقت" });
    const deactivated = await setCustomerActive(manager, customer.id, false);
    expect(deactivated.active).toBe(false);

    const onlyActive = await listCustomers(manager, { activeOnly: true });
    expect(onlyActive.some((c) => c.id === customer.id)).toBe(false);
    const all = await listCustomers(manager);
    expect(all.some((c) => c.id === customer.id)).toBe(true);
  });

  it("rejects customer creation without the customers.create permission", async () => {
    const accountant = await createUser({ username: "acc5", role: "ACCOUNTANT" });
    const actor = await buildAuthUser(accountant);
    let caught: unknown;
    try {
      await createCustomer(actor, { name: "مرفوض" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("POS search requires customers.credit and looks up active customers by name/phone", async () => {
    const cashier = await cashierActor("cash_pos_cust");
    await createCustomer(manager, { name: "زالا", phone: "0111", allowCredit: true });
    const res = await posSearchCustomers(cashier, "زالا");
    expect(res.length).toBeGreaterThan(0);

    const accountant = await createUser({ username: "acc6", role: "ACCOUNTANT" });
    const accActor = await buildAuthUser(accountant);
    let caught: unknown;
    try {
      await posSearchCustomers(accActor, "زالا");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("records a partial credit sale and derives the receivable from the ledger", async () => {
    const cashier = await cashierActor("cash_credit_partial");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("قهوة", 40, 10);
    const customer = await createCustomer(manager, { name: "عميل آجل" });

    const sale = await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 10 }],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });

    expect(sale.paymentState).toBe("PARTIAL");
    expect(sale.balanceDue).toBe(30);
    expect(sale.totalPaid).toBe(10);
    expect(sale.customerName).toBe("عميل آجل");

    const fetched = await getCustomer(cashier, customer.id);
    expect(fetched.balance).toBe(30);
    expect(fetched.saleCount).toBe(1);

    const ledger = await listCustomerLedger(manager, customer.id);
    expect(ledger.some((l) => l.type === "CREDIT_SALE" && l.amount === 30)).toBe(true);
  });

  it("accepts a fully-paid sale even when marked on-credit (no receivable)", async () => {
    const cashier = await cashierActor("cash_credit_full");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("شاي", 20, 10);
    const customer = await createCustomer(manager, { name: "عميل كاش" });

    const sale = await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "VISA", amount: 20 }],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(sale.paymentState).toBe("PAID");
    expect(sale.balanceDue).toBe(0);
    expect((await getCustomer(cashier, customer.id)).balance).toBe(0);
  });

  it("rejects an unused credit sale without a customer", async () => {
    const cashier = await cashierActor("cash_credit_nocust");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("بسكويت", 10, 10);
    let caught: unknown;
    try {
      await createSale(cashier, {
        items: [{ productId, quantity: 1 }],
        payments: [],
        onCredit: true,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");
  });

  it("rejects a credit sale to a customer with allowCredit=false", async () => {
    const cashier = await cashierActor("cash_credit_noallow");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("عصير", 15, 10);
    const customer = await createCustomer(manager, { name: "بلا حساب", allowCredit: false });
    let caught: unknown;
    try {
      await createSale(cashier, {
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 5 }],
        customerId: customer.id,
        onCredit: true,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("rejects a credit sale to an inactive customer", async () => {
    const cashier = await cashierActor("cash_credit_inactive");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("حلوى", 12, 10);
    const customer = await createCustomer(manager, { name: "غير نشط" });
    await setCustomerActive(manager, customer.id, false);
    let caught: unknown;
    try {
      await createSale(cashier, {
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 2 }],
        customerId: customer.id,
        onCredit: true,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("enforces the per-customer credit limit", async () => {
    const cashier = await cashierActor("cash_credit_limit");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("زيت", 50, 20);
    const customer = await createCustomer(manager, { name: "حد ائتماني", creditLimit: 150 });

    const s1 = await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(s1.balanceDue).toBe(50);

    const s2 = await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(s2.balanceDue).toBe(50); // outstanding = 100

    const s3 = await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect(s3.balanceDue).toBe(50); // outstanding = 150 == limit, still allowed

    let caught: unknown;
    try {
      await createSale(cashier, {
        // outstanding 150 + 50 = 200 > 150 -> reject
        items: [{ productId, quantity: 1 }],
        payments: [],
        customerId: customer.id,
        onCredit: true,
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("collects a payment, reduces the receivable, and is idempotent", async () => {
    const cashier = await cashierActor("cash_pay_collect");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct("لبن", 50, 10);
    const customer = await createCustomer(manager, { name: "يسدد" });

    await createSale(cashier, {
      items: [{ productId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 20 }],
      customerId: customer.id,
      onCredit: true,
      idempotencyKey: crypto.randomUUID(),
    });
    expect((await getCustomer(cashier, customer.id)).balance).toBe(80);

    const key = crypto.randomUUID();
    const p1 = await createCustomerPayment(cashier, {
      customerId: customer.id,
      amount: 50,
      method: "CASH",
      idempotencyKey: key,
    });
    const p2 = await createCustomerPayment(cashier, {
      customerId: customer.id,
      amount: 50,
      method: "CASH",
      idempotencyKey: key,
    });

    expect(p2.paymentNumber).toBe(p1.paymentNumber);
    expect((await getCustomer(cashier, customer.id)).balance).toBe(30);

    const payments = await listCustomerPayments(cashier, customer.id);
    expect(payments.length).toBe(1);
    const ledger = await listCustomerLedger(manager, customer.id);
    expect(ledger.some((l) => l.type === "PAYMENT" && l.amount === -50)).toBe(true);
  });

  it("rejects a payment to an inactive customer", async () => {
    const cashier = await cashierActor("cash_pay_inactive");
    const customer = await createCustomer(manager, { name: "مُعطَّل" });
    await setCustomerActive(manager, customer.id, false);
    let caught: unknown;
    try {
      await createCustomerPayment(cashier, {
        customerId: customer.id,
        amount: 10,
        method: "CASH",
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });
});
