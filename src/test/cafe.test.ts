import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { CafeOrderModel } from "@/models/cafe-order";
import { SaleModel } from "@/models/sale";
import { createCategory, createProduct } from "@/services/catalog.service";
import {
  createCafeOrder,
  transitionCafeOrder,
  listKdsOrders,
  listActiveCafeOrders,
  listCafeOrderHistory,
  pollOutboxEvents,
  latestOutboxSequence,
} from "@/services/cafe.service";
import { openShift, computeExpectedCash } from "@/services/shift.service";
import { receivePurchaseStock, getSellableStock } from "@/services/inventory.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";
import type { CafeSugarLevel } from "@/lib/cafe/sugar";

let counter = 0;
async function freshActor(role: "MANAGER" | "CASHIER" | "BARISTA" | "ACCOUNTANT" | "OWNER") {
  counter += 1;
  const u = await createUser({ username: `${role.toLowerCase()}-cafe-${counter}`, role });
  return buildAuthUser(u);
}

interface TestItem {
  productId: string;
  quantity: number;
  notes?: string;
  sugarLevel?: CafeSugarLevel;
}

const prices = new Map<string, number>();

async function makeProduct(name: string, price: number, opts: { stock: number; supportsSugarOptions?: boolean }) {
  const cat = await createCategory(manager, { name: `فئة ${name}` });
  const p = await createProduct(manager, {
    name,
    categoryId: cat.id,
    unit: "قطعة",
    purchaseCost: Math.round(price * 0.5),
    sellingPrice: price,
    minimumStock: 0,
    trackExpiry: false,
    supportsSugarOptions: opts.supportsSugarOptions ?? false,
  });
  const id = p.id;
  prices.set(id, price);
  if (opts.stock > 0) {
    await receivePurchaseStock(
      manager,
      [{ productId: id, productName: name, quantity: opts.stock, trackExpiry: false }],
      {},
    );
  }
  return id;
}

function fullPayments(items: TestItem[]): Array<{ method: "CASH"; amount: number }> {
  const total = items.reduce((s, i) => s + i.quantity * (prices.get(i.productId) ?? 0), 0);
  return [{ method: "CASH", amount: total }];
}

let manager: Awaited<ReturnType<typeof buildAuthUser>>;
let cashier: Awaited<ReturnType<typeof buildAuthUser>>;
let barista: Awaited<ReturnType<typeof buildAuthUser>>;
let accountant: Awaited<ReturnType<typeof buildAuthUser>>;
let productId: string;
let sugarProductId: string;

async function createOrder(
  actor = cashier,
  overrides?: { items?: TestItem[]; note?: string },
): Promise<ReturnType<typeof createCafeOrder> extends Promise<infer T> ? T : never> {
  const items = overrides?.items ?? [{ productId, quantity: 2, notes: "بدون سكر" }];
  return createCafeOrder(actor, {
    items,
    payments: fullPayments(items),
    note: overrides?.note ?? "حليب إضافي",
    idempotencyKey: crypto.randomUUID(),
  });
}

describe("café orders & KDS (Phase 7 + 7.1)", () => {
  beforeAll(async () => {
    await resetDb();
    manager = await freshActor("MANAGER");
    cashier = await freshActor("CASHIER");
    barista = await freshActor("BARISTA");
    accountant = await freshActor("ACCOUNTANT");
    await openShift(cashier, { openingCash: 0 });
    productId = await makeProduct("لاتيه", 35, { stock: 200 });
    sugarProductId = await makeProduct("قهوة تركية", 25, { stock: 200, supportsSugarOptions: true });
  });

  /* ---- Cashier create flow (financial) ---- */

  it("cashier creates an order; the Sale + invoice commit in the same transaction and stock decrements once", async () => {
    const before = await getSellableStock(productId, false);
    const order = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 2, notes: "بدون سكر" }],
      payments: [{ method: "CASH", amount: 70 }],
      note: "حليب إضافي",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(order.orderNumber).toMatch(/^CF-\d{8}-\d{4}$/);
    expect(order.status).toBe("NEW");
    expect(order.totalAmount).toBe(70); // 35 * 2
    expect(order.saleId).toBeTruthy();
    expect(order.invoiceNumber).toMatch(/^INV-/);
    expect(order.invoiceNumber).not.toBe(order.orderNumber);
    expect(order.items[0]).toMatchObject({
      productName: "لاتيه",
      unitPrice: 35,
      quantity: 2,
      lineTotal: 70,
      notes: "بدون سكر",
      sugarLevel: "",
    });
    expect(order.note).toBe("حليب إضافي");
    expect(order.history.length).toBe(1);
    expect(order.history[0]?.status).toBe("NEW");

    const after = await getSellableStock(productId, false);
    expect(after.sellable).toBe(before.sellable - 2);

    const saleDoc = await SaleModel.findById(order.saleId).lean();
    expect(saleDoc).toBeTruthy();
    if (saleDoc) {
      expect(saleDoc.totalAmount).toBe(70);
      expect(saleDoc.invoiceNumber).toBe(order.invoiceNumber);
      expect(String(saleDoc.invoiceNumber).startsWith("INV-")).toBe(true);
    }
  });

  it("replays the same idempotency key: one café order and exactly one Sale (no double deduction)", async () => {
    const key = crypto.randomUUID();
    const first = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: fullPayments([{ productId, quantity: 1 }]),
      idempotencyKey: key,
    });
    const second = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 1 }],
      payments: fullPayments([{ productId, quantity: 1 }]),
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
    expect(await CafeOrderModel.countDocuments({ idempotencyKey: key })).toBe(1);
    expect(await SaleModel.countDocuments({ idempotencyKey: `cafe-sale:${key}` })).toBe(1);
  });

  it("rejects an empty order and an unknown product (VALIDATION / NOT_FOUND)", async () => {
    let caught: unknown;
    try {
      await createCafeOrder(cashier, {
        items: [],
        payments: [{ method: "CASH", amount: 0 }],
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");

    let caught2: unknown;
    try {
      await createCafeOrder(cashier, {
        items: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 }],
        payments: fullPayments([{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 }]),
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught2 = error;
    }
    expect(caught2).toBeInstanceOf(AppError);
    if (caught2 instanceof AppError) expect(caught2.code).toBe("NOT_FOUND");
  });

  /* ---- Sugar (Phase 7.1) ---- */

  it("rejects selecting sugar for a product that does not support sugar options (rolls back: no order, no sale)", async () => {
    const key = crypto.randomUUID();
    let caught: unknown;
    try {
      await createCafeOrder(cashier, {
        items: [{ productId, quantity: 1, sugarLevel: "STANDARD" }],
        payments: fullPayments([{ productId, quantity: 1 }]),
        idempotencyKey: key,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");
    expect(await CafeOrderModel.countDocuments({ idempotencyKey: key })).toBe(0);
    expect(await SaleModel.countDocuments({ idempotencyKey: `cafe-sale:${key}` })).toBe(0);
  });

  it("rejects an unknown sugar level via the validation schema", async () => {
    let caught: unknown;
    try {
      await createCafeOrder(cashier, {
        items: [{ productId: sugarProductId, quantity: 1, sugarLevel: "NOPE" as CafeSugarLevel }],
        payments: fullPayments([{ productId: sugarProductId, quantity: 1 }]),
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");
  });

  it("merges identical (product + sugar + customization) lines but keeps different sugar per-cup (per-cup rule)", async () => {
    const order = await createCafeOrder(cashier, {
      items: [
        { productId: sugarProductId, quantity: 1, sugarLevel: "PLAIN", notes: "بدون سكر" },
        { productId: sugarProductId, quantity: 2, sugarLevel: "PLAIN", notes: "بدون سكر" },
        { productId: sugarProductId, quantity: 2, sugarLevel: "STANDARD" },
        { productId: sugarProductId, quantity: 1, sugarLevel: "CARAMEL" },
      ],
      payments: fullPayments([
        { productId: sugarProductId, quantity: 1 },
        { productId: sugarProductId, quantity: 2 },
        { productId: sugarProductId, quantity: 2 },
        { productId: sugarProductId, quantity: 1 },
      ]),
      idempotencyKey: crypto.randomUUID(),
    });

    // Identical PLAIN lines merged to 3; STANDARD and CARAMEL stay separate.
    expect(order.items.length).toBe(3);
    expect(order.items.map((i) => i.sugarLevel)).toEqual(["PLAIN", "STANDARD", "CARAMEL"]);
    expect(order.items.map((i) => i.quantity)).toEqual([3, 2, 1]);
    expect(order.items[0]?.notes).toBe("بدون سكر");

    const total = 3 * 25 + 2 * 25 + 1 * 25;
    expect(order.totalAmount).toBe(total);
    expect(order.items.reduce((s, i) => s + i.lineTotal, 0)).toBe(total);
  });

  /* ---- Payments & shift / inventory effects ---- */

  it("requires payments to equal the total (VALIDATION), rolling back the whole transaction", async () => {
    const key = crypto.randomUUID();
    let caught: unknown;
    try {
      await createCafeOrder(cashier, {
        items: [{ productId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 15 }], // price is 35
        idempotencyKey: key,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");
    expect(await CafeOrderModel.countDocuments({ idempotencyKey: key })).toBe(0);
    expect(await SaleModel.countDocuments({ idempotencyKey: `cafe-sale:${key}` })).toBe(0);
  });

  it("stores mixed payments on the Sale; only CASH raises the shift's expected cash", async () => {
    const c = await freshActor("CASHIER");
    const shift = await openShift(c, { openingCash: 500 });
    const latte = await makeProduct("كابتشينو", 30, { stock: 50 });

    const order = await createCafeOrder(c, {
      items: [{ productId: latte, quantity: 2 }],
      payments: [
        { method: "CASH", amount: 30 },
        { method: "VISA", amount: 30 },
      ],
      idempotencyKey: crypto.randomUUID(),
    });

    expect(order.totalAmount).toBe(60);
    const saleDoc = await SaleModel.findById(order.saleId).lean<{
      totalAmount: number;
      payments: Array<{ method: string; amount: number }>;
    }>();
    expect(saleDoc).toBeTruthy();
    if (saleDoc) {
      expect(saleDoc.totalAmount).toBe(60);
      expect(saleDoc.payments.reduce((s, p) => s + p.amount, 0)).toBe(60);
      expect(saleDoc.payments.some((p) => p.method === "CASH" && p.amount === 30)).toBe(true);
      expect(saleDoc.payments.some((p) => p.method === "VISA" && p.amount === 30)).toBe(true);
    }
    expect(await computeExpectedCash(shift.id)).toBe(530); // 500 + CASH(30); VISA excluded
  });

  it("rolls back the entire transaction on oversell (no order, no sale, stock untouched)", async () => {
    const scarce = await makeProduct("قهوة سريعة", 20, { stock: 3 });
    const c = await freshActor("CASHIER");
    await openShift(c, { openingCash: 0 });

    let caught: unknown;
    try {
      await createCafeOrder(c, {
        items: [{ productId: scarce, quantity: 5 }],
        payments: [{ method: "CASH", amount: 100 }],
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");

    const stock = await getSellableStock(scarce, false);
    expect(stock.sellable).toBe(3);
  });

  it("cancellation stays operational: the linked Sale is never reversed", async () => {
    const order = await createOrder();
    const cancelled = await transitionCafeOrder(cashier, order.id, "CANCELLED");
    expect(cancelled.status).toBe("CANCELLED");

    const saleDoc = await SaleModel.findById(order.saleId).lean<{ status?: string; totalAmount: number }>();
    expect(saleDoc).toBeTruthy();
    if (saleDoc) {
      expect(saleDoc.totalAmount).toBe(70);
      expect(saleDoc.status ?? "COMPLETED").toBe("COMPLETED");
    }
  });

  /* ---- State machine ---- */

  it("advances NEW → PREPARING → READY → COMPLETED via the barista", async () => {
    const order = await createOrder();
    const prep = await transitionCafeOrder(barista, order.id, "PREPARING");
    expect(prep.status).toBe("PREPARING");
    expect(prep.version).toBe(1);

    const ready = await transitionCafeOrder(barista, order.id, "READY");
    expect(ready.status).toBe("READY");
    expect(ready.version).toBe(2);

    const done = await transitionCafeOrder(barista, order.id, "COMPLETED");
    expect(done.status).toBe("COMPLETED");
    expect(done.version).toBe(3);
    expect(done.history.map((h) => h.status)).toEqual(["NEW", "PREPARING", "READY", "COMPLETED"]);
  });

  it("rejects invalid transitions (COMPLETED → PREPARING, READY → PREPARING, etc.)", async () => {
    const order = await createOrder();
    await transitionCafeOrder(barista, order.id, "PREPARING");
    await transitionCafeOrder(barista, order.id, "READY");
    await transitionCafeOrder(barista, order.id, "COMPLETED");

    const cases: Array<[string, "PREPARING" | "READY" | "COMPLETED" | "CANCELLED"]> = [
      ["COMPLETED → PREPARING must be rejected", "PREPARING"],
      ["COMPLETED → READY must be rejected", "READY"],
      ["COMPLETED → COMPLETED self-transition rejected", "COMPLETED"],
    ];
    for (const [label, target] of cases) {
      let caught: unknown;
      try {
        await transitionCafeOrder(barista, order.id, target);
      } catch (error) {
        caught = error;
      }
      expect(caught, label).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    }
  });

  it("rejects skipping steps (PREPARING → COMPLETED without READY)", async () => {
    const order = await createOrder();
    await transitionCafeOrder(barista, order.id, "PREPARING");
    let caught: unknown;
    try {
      await transitionCafeOrder(barista, order.id, "COMPLETED");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("allows NEW → CANCELLED but not COMPLETED → CANCELLED", async () => {
    const cancellable = await createOrder();
    const cancelled = await transitionCafeOrder(cashier, cancellable.id, "CANCELLED");
    expect(cancelled.status).toBe("CANCELLED");

    const done = await createOrder();
    await transitionCafeOrder(barista, done.id, "PREPARING");
    await transitionCafeOrder(barista, done.id, "READY");
    await transitionCafeOrder(barista, done.id, "COMPLETED");
    let caught: unknown;
    try {
      await transitionCafeOrder(cashier, done.id, "CANCELLED");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  /* ---- Authorization matrix ---- */

  it("BARISTA can advance status but cannot create orders (no sales.create)", async () => {
    let caught: unknown;
    try {
      await createOrder(barista);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");

    const c = await createOrder();
    const prep = await transitionCafeOrder(barista, c.id, "PREPARING");
    expect(prep.status).toBe("PREPARING");
  });

  it("BARISTA cannot cancel (distinct cancel permission)", async () => {
    const order = await createOrder();
    let caught: unknown;
    try {
      await transitionCafeOrder(barista, order.id, "CANCELLED");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("ACCOUNTANT cannot create or transition café orders", async () => {
    let caughtCreate: unknown;
    try {
      await createOrder(accountant);
    } catch (error) {
      caughtCreate = error;
    }
    expect(caughtCreate).toBeInstanceOf(AppError);
    if (caughtCreate instanceof AppError) expect(caughtCreate.code).toBe("FORBIDDEN");

    const order = await createOrder();
    let caughtTrans: unknown;
    try {
      await transitionCafeOrder(accountant, order.id, "PREPARING");
    } catch (error) {
      caughtTrans = error;
    }
    expect(caughtTrans).toBeInstanceOf(AppError);
    if (caughtTrans instanceof AppError) expect(caughtTrans.code).toBe("FORBIDDEN");
  });

  it("listKdsOrders requires cafe.kds.view; active list requires cafe.orders.read", async () => {
    await expect(listKdsOrders(barista)).resolves.toBeInstanceOf(Array);
    await expect(listActiveCafeOrders(cashier)).resolves.toBeInstanceOf(Array);

    let caught: unknown;
    try {
      await listKdsOrders(accountant);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  /* ---- Reads ---- */

  it("KDS board returns only active orders, oldest first", async () => {
    const a = await createOrder();
    const b = await createOrder();
    await transitionCafeOrder(barista, b.id, "PREPARING");
    const board = await listKdsOrders(barista);
    const ids = board.map((o) => o.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
    const activeOnly = board.every((o) => ["NEW", "PREPARING", "READY"].includes(o.status));
    expect(activeOnly).toBe(true);
    expect(board).toEqual([...board].sort((x, y) => x.createdAt.localeCompare(y.createdAt)));
  });

  it("history lists completed/cancelled orders only", async () => {
    const done = await createOrder();
    await transitionCafeOrder(barista, done.id, "PREPARING");
    await transitionCafeOrder(barista, done.id, "READY");
    await transitionCafeOrder(barista, done.id, "COMPLETED");
    const history = await listCafeOrderHistory(manager, 50);
    expect(history.some((o) => o.id === done.id && o.status === "COMPLETED")).toBe(true);
  });

  /* ---- Realtime (outbox) ---- */

  it("appends CAFE_ORDER_CREATED and CAFE_ORDER_STATUS_CHANGED events to the outbox", async () => {
    const before = await latestOutboxSequence(manager);
    const order = await createOrder();
    const created = await pollOutboxEvents(manager, before, 100);
    expect(created.some((e) => e.type === "CAFE_ORDER_CREATED" && e.payload.orderId === order.id)).toBe(true);

    await transitionCafeOrder(barista, order.id, "PREPARING");
    const changed = await pollOutboxEvents(manager, before, 100);
    expect(changed.some((e) => e.type === "CAFE_ORDER_STATUS_CHANGED" && e.payload.orderId === order.id && e.payload.to === "PREPARING")).toBe(true);
  });

  it("pollOutboxEvents resumes from the given sequence (out-of-order safe) and events carry unique ids", async () => {
    const base = await latestOutboxSequence(manager);
    const o1 = await createOrder();
    const o2 = await createOrder();
    const events = await pollOutboxEvents(manager, base, 100);
    const filter = events.filter(
      (e) => e.type === "CAFE_ORDER_CREATED" && (e.payload.orderId === o1.id || e.payload.orderId === o2.id),
    );
    expect(filter.length).toBe(2);
    const ids = new Set(filter.map((e) => e.eventId));
    expect(ids.size).toBe(2); // unique, idempotent event ids

    // Re-polling with a stale `after` redelivers the same events (client dedupes by eventId).
    const again = await pollOutboxEvents(manager, base, 100);
    const againFiltered = again.filter(
      (e) => e.type === "CAFE_ORDER_CREATED" && (e.payload.orderId === o1.id || e.payload.orderId === o2.id),
    );
    expect(againFiltered.map((e) => e.eventId)).toEqual(filter.map((e) => e.eventId));
  });
});