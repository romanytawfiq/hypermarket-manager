import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createSupplier,
  getSupplier,
  listSuppliers,
  listSupplierLedger,
  listSupplierPayments,
} from "@/services/supplier.service";
import {
  createPurchase,
  receivePurchase,
  createSupplierPayment,
  createSupplierReturn,
  listPurchases,
} from "@/services/purchasing.service";
import { createProduct, createCategory } from "@/services/catalog.service";
import { getSellableStock } from "@/services/inventory.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

async function managerActor() {
  const m = await createUser({ username: "mgr3", role: "MANAGER" });
  return buildAuthUser(m);
}

async function cashierActor() {
  const c = await createUser({ username: "cash3", role: "CASHIER" });
  return buildAuthUser(c);
}

describe("suppliers & purchasing", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;
  let productId: string;
  let nonExpiryId: string;

  beforeAll(async () => {
    await resetDb();
    manager = await managerActor();
    const category = await createCategory(manager, { name: "أصناف" });
    const p = await createProduct(manager, {
      name: "كولا",
      categoryId: category.id,
      unit: "زجاجة",
      purchaseCost: 20,
      sellingPrice: 30,
      minimumStock: 0,
    });
    const p2 = await createProduct(manager, {
      name: "ماء",
      categoryId: category.id,
      unit: "زجاجة",
      purchaseCost: 5,
      sellingPrice: 10,
      minimumStock: 0,
    });
    productId = p.id;
    nonExpiryId = p2.id;
  });

  it("creates and lists a supplier (balance 0)", async () => {
    const s = await createSupplier(manager, { name: "شركة النور" });
    expect(s.balance).toBe(0);
    const list = await listSuppliers(manager);
    expect(list.some((x) => x.id === s.id)).toBe(true);
  });

  it("blocks supplier creation for a cashier (FORBIDDEN)", async () => {
    const cashier = await cashierActor();
    let caught: unknown;
    try {
      await createSupplier(cashier, { name: "غير مسموح" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("a credit purchase increases the supplier payable balance", async () => {
    const supplier = await createSupplier(manager, { name: "مورد آجل" });
    await createPurchase(manager, {
      supplierId: supplier.id,
      items: [{ productId, quantity: 10, cost: 20 }],
    });

    const fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(200);

    const ledger = await listSupplierLedger(manager, supplier.id);
    expect(ledger.find((l) => l.type === "PURCHASE")?.amount).toBe(200);
  });

  it("a fully-paid (cash) purchase does not create an outstanding balance", async () => {
    const supplier = await createSupplier(manager, { name: "مورد نقدي" });
    await createPurchase(manager, {
      supplierId: supplier.id,
      paidImmediately: true,
      items: [{ productId, quantity: 5, cost: 20 }],
    });

    const fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(0);

    const payments = await listSupplierPayments(manager, supplier.id);
    expect(payments.length).toBe(1);
    expect(payments[0]?.amount).toBe(100);
  });

  it("receiving a purchase increases inventory and updates status", async () => {
    const supplier = await createSupplier(manager, { name: "مورد استلام" });
    const purchase = await createPurchase(manager, {
      supplierId: supplier.id,
      items: [{ productId: nonExpiryId, quantity: 8, cost: 5 }],
    });

    const before = await getSellableStock(nonExpiryId, false);
    expect(before.sellable).toBe(0);

    await receivePurchase(manager, {
      purchaseId: purchase.id,
      items: [{ productId: nonExpiryId, acceptedQuantity: 8, rejectedQuantity: 0 }],
    });

    const after = await getSellableStock(nonExpiryId, false);
    expect(after.sellable).toBe(8);

    const list = await listPurchases(manager, { page: 1, pageSize: 50 });
    const received = list.items.find((p) => p.id === purchase.id);
    expect(received?.status).toBe("RECEIVED");
  });

  it("a supplier payment reduces the payable balance", async () => {
    const supplier = await createSupplier(manager, { name: "مورد دفع" });
    await createPurchase(manager, {
      supplierId: supplier.id,
      items: [{ productId, quantity: 4, cost: 100 }],
    });
    let fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(400);

    await createSupplierPayment(manager, { supplierId: supplier.id, amount: 150, method: "CASH", idempotencyKey: crypto.randomUUID() });

    fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(250);

    const ledger = await listSupplierLedger(manager, supplier.id);
    expect(ledger.find((l) => l.type === "PAYMENT")?.amount).toBe(-150);
  });

  it("a supplier payment is idempotent: replaying the key never double-posts", async () => {
    const supplier = await createSupplier(manager, { name: "مورد آيدي" });
    await createPurchase(manager, {
      supplierId: supplier.id,
      items: [{ productId, quantity: 4, cost: 100 }],
    });
    const key = "supplier-pay-idem-001";

    const first = await createSupplierPayment(manager, {
      supplierId: supplier.id,
      amount: 150,
      method: "CASH",
      idempotencyKey: key,
    });
    const replay = await createSupplierPayment(manager, {
      supplierId: supplier.id,
      amount: 150,
      method: "CASH",
      idempotencyKey: key,
    });

    expect(replay.id).toBe(first.id);

    const fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(250); // 400 - 150, not 400 - 300

    const payments = await listSupplierPayments(manager, supplier.id);
    expect(payments.length).toBe(1);
  });

  it("a supplier return reduces balance and removes stock", async () => {
    const supplier = await createSupplier(manager, { name: "مورد مرتجع" });
    const purchase = await createPurchase(manager, {
      supplierId: supplier.id,
      items: [{ productId: nonExpiryId, quantity: 10, cost: 5 }],
    });
    await receivePurchase(manager, {
      purchaseId: purchase.id,
      items: [{ productId: nonExpiryId, acceptedQuantity: 10, rejectedQuantity: 0 }],
    });

    let fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(50);
    const before = await getSellableStock(nonExpiryId, false);
    expect(before.sellable).toBeGreaterThanOrEqual(10);

    await createSupplierReturn(manager, {
      supplierId: supplier.id,
      purchaseId: purchase.id,
      items: [{ productId: nonExpiryId, quantity: 4, cost: 5 }],
    });

    fetched = await getSupplier(manager, supplier.id);
    expect(fetched.balance).toBe(30);
    const after = await getSellableStock(nonExpiryId, false);
    expect(after.sellable).toBe(before.sellable - 4);
  });
});
