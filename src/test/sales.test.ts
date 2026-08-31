import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createSale,
  posSearchProducts,
  getSale,
} from "@/services/sales.service";
import {
  openShift,
  closeShift,
  getActiveShift,
  computeExpectedCash,
  recordCashMovement,
} from "@/services/shift.service";
import {
  createProduct,
  createCategory,
} from "@/services/catalog.service";
import { receivePurchaseStock, getSellableStock } from "@/services/inventory.service";
import { ProductBatchModel } from "@/models/product-batch";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

async function managerActor() {
  const m = await createUser({ username: "mgr4", role: "MANAGER" });
  return buildAuthUser(m);
}

async function cashierActor(username: string) {
  const c = await createUser({ username, role: "CASHIER" });
  return buildAuthUser(c);
}

describe("POS sales, payments & cashier shifts (Phase 4)", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;

  beforeAll(async () => {
    await resetDb();
    manager = await managerActor();
  });

  /** Creates a category+product and receives `stock` sellable units. */
  async function makeProduct(opts: {
    name: string;
    purchaseCost: number;
    sellingPrice: number;
    trackExpiry?: boolean;
    stock: number;
    expiryDates?: string[];
  }): Promise<string> {
    const cat = await createCategory(manager, { name: `فئة ${opts.name}` });
    const p = await createProduct(manager, {
      name: opts.name,
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: opts.purchaseCost,
      sellingPrice: opts.sellingPrice,
      minimumStock: 0,
      trackExpiry: opts.trackExpiry,
    });
    if (opts.stock > 0) {
      const dates = opts.expiryDates ?? [];
      if (opts.trackExpiry && dates.length === 0) {
        await receivePurchaseStock(
          manager,
          [{ productId: p.id, productName: opts.name, quantity: opts.stock, trackExpiry: true, expiryDate: addDays(90) }],
          {},
        );
      } else if (opts.trackExpiry) {
        // Split stock across the provided expiry batches (FEFO source of truth).
        const perBatch = Math.floor(opts.stock / dates.length);
        for (let i = 0; i < dates.length; i++) {
          const qty = i === dates.length - 1 ? opts.stock - perBatch * (dates.length - 1) : perBatch;
          await receivePurchaseStock(
            manager,
            [{ productId: p.id, productName: opts.name, quantity: qty, trackExpiry: true, expiryDate: dates[i] }],
            {},
          );
        }
      } else {
        await receivePurchaseStock(
          manager,
          [{ productId: p.id, productName: opts.name, quantity: opts.stock, trackExpiry: false }],
          {},
        );
      }
    }
    return p.id;
  }

  function addDays(n: number): string {
    return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString();
  }

  it("requires an active shift before a sale can be created", async () => {
    const cashier = await cashierActor("cash_no_shift");
    const productId = await makeProduct({ name: "منتج بلا وردية", purchaseCost: 10, sellingPrice: 20, stock: 10 });
    let caught: unknown;
    try {
      await createSale(cashier, {
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 20 }],
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("opens a shift and rejects opening a second one", async () => {
    const cashier = await cashierActor("cash_open");
    const s1 = await openShift(cashier, { openingCash: 200 });
    expect(s1.status).toBe("OPEN");
    expect(s1.openingCash).toBe(200);

    const active = await getActiveShift(cashier);
    expect(active?.id).toBe(s1.id);

    let caught: unknown;
    try {
      await openShift(cashier, { openingCash: 0 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("completes a sale, decrements stock, and prints a sequential invoice number", async () => {
    const cashier = await cashierActor("cash_sale");
    const shift = await openShift(cashier, { openingCash: 100 });
    const productId = await makeProduct({ name: "كولا", purchaseCost: 20, sellingPrice: 30, stock: 50 });

    const before = await getSellableStock(productId, false);
    expect(before.sellable).toBe(50);

    const sale = await createSale(cashier, {
      items: [
        { productId, quantity: 2 },
        { productId, quantity: 1 },
      ],
      payments: [
        { method: "CASH", amount: 60 },
        { method: "VISA", amount: 30 },
      ],
      idempotencyKey: crypto.randomUUID(),
      customerName: "أحمد",
      cashTendered: 60,
    });

    expect(sale.invoiceNumber).toMatch(/^INV-/);
    expect(sale.totalAmount).toBe(90);
    expect(sale.payments.length).toBe(2);
    expect(sale.payments.reduce((s, p) => s + p.amount, 0)).toBe(90);
    expect(sale.shiftId).toBe(shift.id);
    expect(sale.customerName).toBe("أحمد");

    const after = await getSellableStock(productId, false);
    expect(after.sellable).toBe(47);

    const fetched = await getSale(cashier, sale.id);
    expect(fetched.id).toBe(sale.id);
  });

  it("is idempotent: retrying the same key reuses the existing sale without double deduction", async () => {
    const cashier = await cashierActor("cash_idem");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct({ name: "ماء", purchaseCost: 5, sellingPrice: 10, stock: 20 });
    const before = await getSellableStock(productId, false);
    const key = crypto.randomUUID();

    const first = await createSale(cashier, {
      items: [{ productId, quantity: 3 }],
      payments: [{ method: "CASH", amount: 30 }],
      idempotencyKey: key,
    });
    const second = await createSale(cashier, {
      items: [{ productId, quantity: 3 }],
      payments: [{ method: "CASH", amount: 30 }],
      idempotencyKey: key,
    });

    expect(second.id).toBe(first.id);
    const after = await getSellableStock(productId, false);
    expect(after.sellable).toBe(before.sellable - 3);
  });

  it("rejects a sale whose payments do not equal the total", async () => {
    const cashier = await cashierActor("cash_pay_err");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct({ name: "عصير", purchaseCost: 10, sellingPrice: 20, stock: 10 });
    let caught: unknown;
    try {
      await createSale(cashier, {
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 15 }],
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");
  });

  it("rejects overselling beyond available stock", async () => {
    const cashier = await cashierActor("cash_oversell");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct({ name: "شيبسي", purchaseCost: 5, sellingPrice: 10, stock: 3 });
    let caught: unknown;
    try {
      await createSale(cashier, {
        items: [{ productId, quantity: 4 }],
        payments: [{ method: "CASH", amount: 40 }],
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("returns sellable products from the POS search (no products.read needed)", async () => {
    const cashier = await cashierActor("cash_search");
    const productId = await makeProduct({ name: "بطاطس", purchaseCost: 5, sellingPrice: 12, stock: 8 });
    const results = await posSearchProducts(cashier, "بطاطس");
    expect(results.some((r) => r.id === productId && r.sellable === 8)).toBe(true);
  });

  it("consumes the earliest-expiring batch first (FEFO) for expiry-tracked products", async () => {
    const cashier = await cashierActor("cash_fefo");
    await openShift(cashier, { openingCash: 0 });
    const productId = await makeProduct({
      name: "لبن",
      purchaseCost: 5,
      sellingPrice: 10,
      trackExpiry: true,
      stock: 10,
      expiryDates: [addDays(60), addDays(10)],
    });

    const batchesBefore = await ProductBatchModel.find({ product: productId })
      .sort({ expiryDate: 1 })
      .select("expiryDate quantity")
      .lean<Array<{ expiryDate: Date; quantity: number }>>();
    expect(batchesBefore.length).toBe(2);

    await createSale(cashier, {
      items: [{ productId, quantity: 3 }],
      payments: [{ method: "CASH", amount: 30 }],
      idempotencyKey: crypto.randomUUID(),
    });

    const batchesAfter = await ProductBatchModel.find({ product: productId })
      .sort({ expiryDate: 1 })
      .select("expiryDate quantity")
      .lean<Array<{ expiryDate: Date; quantity: number }>>();
    // Earliest batch (10 days) should be drained first; the later batch untouched.
    expect(batchesAfter[0]?.quantity).toBe(2); // 5 - 3
    expect(batchesAfter[1]?.quantity).toBe(5);
  });

  it("closes a shift with server-computed expected cash and variance", async () => {
    const cashier = await cashierActor("cash_close");
    const shift = await openShift(cashier, { openingCash: 500 });
    const productId = await makeProduct({ name: "قهوة", purchaseCost: 30, sellingPrice: 60, stock: 10 });

    await createSale(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 60 }],
      idempotencyKey: crypto.randomUUID(),
      cashTendered: 100,
    });

    const closed = await closeShift(cashier, shift.id, { actualCash: 560 });
    expect(closed.status).toBe("CLOSED");
    expect(closed.expectedCash).toBe(560); // 500 opening + 60 cash sales
    expect(closed.actualCash).toBe(560);
    expect(closed.variance).toBe(0);
    expect(closed.closedAt).not.toBeNull();

    const active = await getActiveShift(cashier);
    expect(active).toBeNull();
  });

  it("includes recorded cash movements in the expected-cash reconciliation", async () => {
    const cashier = await cashierActor("cash_mvmt");
    const managerActor2 = await managerActor();
    const shift = await openShift(cashier, { openingCash: 300 });
    const productId = await makeProduct({ name: "حلوى", purchaseCost: 5, sellingPrice: 10, stock: 5 });

    await createSale(cashier, {
      items: [{ productId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 20 }],
      idempotencyKey: crypto.randomUUID(),
    });

    // Manager adds cash-in to the till.
    await recordCashMovement(managerActor2, shift.id, { type: "CASH_IN", amount: 50, reason: "تسوية" });

    const expected = await computeExpectedCash(shift.id);
    expect(expected).toBe(370); // 300 opening + 20 cash sales + 50 cash-in

    // Cashier may NOT create a cash movement (no cash_movements.create).
    let caught: unknown;
    try {
      await recordCashMovement(cashier, shift.id, { type: "CASH_OUT", amount: 10, reason: "غير مسموح" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });
});
