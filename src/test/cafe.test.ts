import { describe, it, expect, beforeAll } from "vitest";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { ProductModel } from "@/models/product";
import { CafeOrderModel } from "@/models/cafe-order";
import {
  createCafeOrder,
  transitionCafeOrder,
  listKdsOrders,
  listActiveCafeOrders,
  listCafeOrderHistory,
  pollOutboxEvents,
  latestOutboxSequence,
} from "@/services/cafe.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

let counter = 0;
async function freshActor(role: "MANAGER" | "CASHIER" | "BARISTA" | "ACCOUNTANT" | "OWNER") {
  counter += 1;
  const u = await createUser({ username: `${role.toLowerCase()}-cafe-${counter}`, role });
  return buildAuthUser(u);
}

async function makeProduct(name: string, price: number) {
  const categoryId = new mongoose.Types.ObjectId();
  const p = await ProductModel.create({
    name,
    category: categoryId,
    unit: "قطعة",
    purchaseCost: Math.round(price * 0.5),
    sellingPrice: price,
    minimumStock: 0,
    trackExpiry: false,
    onlineVisible: false,
    active: true,
  });
  return (p._id as mongoose.Types.ObjectId).toString();
}

let manager: Awaited<ReturnType<typeof buildAuthUser>>;
let cashier: Awaited<ReturnType<typeof buildAuthUser>>;
let barista: Awaited<ReturnType<typeof buildAuthUser>>;
let accountant: Awaited<ReturnType<typeof buildAuthUser>>;
let productId: string;

async function createOrder(actor = cashier) {
  return createCafeOrder(actor, {
    items: [{ productId, quantity: 2, notes: "بدون سكر" }],
    note: "حليب إضافي",
    idempotencyKey: crypto.randomUUID(),
  });
}

describe("café orders & KDS (Phase 7)", () => {
  beforeAll(async () => {
    await resetDb();
    manager = await freshActor("MANAGER");
    cashier = await freshActor("CASHIER");
    barista = await freshActor("BARISTA");
    accountant = await freshActor("ACCOUNTANT");
    productId = await makeProduct("لاتيه", 35);
  });

  /* ---- Cashier create flow ---- */

  it("cashier creates an order; server snapshots price and derives totals/order number", async () => {
    const order = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 2, notes: "بدون سكر" }],
      note: "حليب إضافي",
      idempotencyKey: crypto.randomUUID(),
    });
    expect(order.orderNumber).toMatch(/^CF-\d{8}-\d{4}$/);
    expect(order.status).toBe("NEW");
    expect(order.totalAmount).toBe(70); // 35 * 2
    expect(order.items[0]).toMatchObject({ productName: "لاتيه", unitPrice: 35, quantity: 2, lineTotal: 70, notes: "بدون سكر" });
    expect(order.note).toBe("حليب إضافي");
    expect(order.history.length).toBe(1);
    expect(order.history[0]?.status).toBe("NEW");

    // No financial Sale is recorded — the order is operational only.
    const orderDocs = await CafeOrderModel.find({ _id: order.id }).lean();
    expect(orderDocs.length).toBe(1);
    expect(orderDocs[0]?.status).toBe("NEW");
  });

  it("is idempotent: replaying the same key returns the existing order without a duplicate", async () => {
    const key = crypto.randomUUID();
    const first = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key,
    });
    const second = await createCafeOrder(cashier, {
      items: [{ productId, quantity: 1 }],
      idempotencyKey: key,
    });
    expect(second.id).toBe(first.id);
    const count = await CafeOrderModel.countDocuments({ idempotencyKey: key });
    expect(count).toBe(1);
  });

  it("rejects an empty order and an unknown product (VALIDATION / NOT_FOUND)", async () => {
    let caught: unknown;
    try {
      await createCafeOrder(cashier, { items: [], idempotencyKey: crypto.randomUUID() });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");

    let caught2: unknown;
    try {
      await createCafeOrder(cashier, {
        items: [{ productId: new mongoose.Types.ObjectId().toString(), quantity: 1 }],
        idempotencyKey: crypto.randomUUID(),
      });
    } catch (error) {
      caught2 = error;
    }
    expect(caught2).toBeInstanceOf(AppError);
    if (caught2 instanceof AppError) expect(caught2.code).toBe("NOT_FOUND");
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

  it("BARISTA can advance status but cannot create orders", async () => {
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

  it("BARISTA cannot cancel (distinct cancel permission) — only creators/authorized roles may", async () => {
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
