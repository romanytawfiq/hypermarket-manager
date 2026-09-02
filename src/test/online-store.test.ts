import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createOnlineOrder,
  trackOnlineOrder,
  listOnlineOrders,
  listOnlineOrdersPage,
  getOnlineOrder,
  transitionOnlineOrder,
  assignOnlineOrder,
  collectCodAndDeliver,
  listOnlineProducts,
  getOnlineProduct,
  listDeliveryOrders,
  searchOnlineProducts,
  getOnlineCategories,
  markOnlineOrderPaid,
  deliverPaidOnlineOrder,
  type OnlineOrderDto,
} from "@/services/online-store.service";
import { openShift } from "@/services/shift.service";
import { getSale } from "@/services/sales.service";
import {
  createProduct,
  createCategory,
  createBrand,
} from "@/services/catalog.service";
import { receivePurchaseStock, getSellableStock } from "@/services/inventory.service";
import { InventoryReservationModel } from "@/models/inventory-reservation";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

type Actor = Awaited<ReturnType<typeof buildAuthUser>>;

async function managerActor(username = "on-mgr") {
  const m = await createUser({ username, role: "MANAGER" });
  return buildAuthUser(m);
}

async function deliveryActor(username: string) {
  const d = await createUser({ username, role: "DELIVERY" });
  return buildAuthUser(d);
}

async function cashierActor(username: string) {
  const c = await createUser({ username, role: "CASHIER" });
  return buildAuthUser(c);
}

function addr(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fullName: "مستلم",
    phone: "01000000000",
    city: "القاهرة",
    area: "المعادي",
    street: "شارع 1",
    landmark: "مسجد",
    notes: "عند الباب",
    ...overrides,
  };
}

function checkoutInput(opts: {
  items: Array<{ productId: string; quantity: number }>;
  idempotencyKey: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}) {
  return {
    customerName: opts.customerName ?? "عميل متجر",
    customerPhone: opts.customerPhone ?? "01000000000",
    customerEmail: opts.customerEmail ?? "",
    deliveryAddress: addr(),
    items: opts.items,
    idempotencyKey: opts.idempotencyKey,
  };
}

describe("Phase 9 — Online store & delivery", () => {
  let manager: Actor;

  /** Creates a category + product and receives `stock` sellable units. */
  async function makeProduct(opts: {
    name: string;
    purchaseCost: number;
    sellingPrice: number;
    stock: number;
    onlineVisible?: boolean;
    active?: boolean;
    brandId?: string;
  }): Promise<string> {
    const cat = await createCategory(manager, { name: `فئة ${opts.name}` });
    const p = await createProduct(manager, {
      name: opts.name,
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: opts.purchaseCost,
      sellingPrice: opts.sellingPrice,
      minimumStock: 0,
      onlineVisible: opts.onlineVisible ?? true,
      brandId: opts.brandId,
    });
    if (opts.stock > 0) {
      await receivePurchaseStock(
        manager,
        [{ productId: p.id, productName: opts.name, quantity: opts.stock, trackExpiry: false }],
        {},
      );
    }
    return p.id;
  }

  beforeAll(async () => {
    await resetDb();
    manager = await managerActor();
  });

  describe("Catalog visibility & availability", () => {
    it("only lists online-visible, active products with live availability", async () => {
      const visible = await makeProduct({ name: "منتج ظاهر", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const hidden = await makeProduct({ name: "منتج مخفي", purchaseCost: 10, sellingPrice: 20, stock: 5, onlineVisible: false });

      const listed = await listOnlineProducts();
      const names = listed.map((p) => p.name);
      expect(names).toContain("منتج ظاهر");
      expect(names).not.toContain("منتج مخفي");

      const visibleDto = listed.find((p) => p.id === visible);
      expect(visibleDto?.available).toBe(5);
      expect(visibleDto?.inStock).toBe(true);

      expect(await getOnlineProduct(hidden)).toBeNull();
    });

    it("availability excludes active reservations", async () => {
      const pid = await makeProduct({ name: "منتج محجوز", purchaseCost: 10, sellingPrice: 20, stock: 3 });

      const before = await listOnlineProducts();
      expect(before.find((p) => p.id === pid)?.available).toBe(3);

      await createOnlineOrder(
        checkoutInput({
          items: [{ productId: pid, quantity: 2 }],
          idempotencyKey: "ava-res-1",
        }),
      );

      const after = await listOnlineProducts();
      expect(after.find((p) => p.id === pid)?.available).toBe(1);
      expect(await getOnlineProduct(pid)).toMatchObject({ available: 1, inStock: true });
    });

    it("surfaces the brand name and logo on the storefront product (Phase 9.3)", async () => {
      const brand = await createBrand(manager, {
        name: "شعارالمتجر",
        logo:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      });
      const pid = await makeProduct({ name: "منتج بعلامة", purchaseCost: 5, sellingPrice: 15, stock: 4, brandId: brand.id });

      const listed = await listOnlineProducts();
      const dto = listed.find((p) => p.id === pid);
      expect(dto?.brandName).toBe("شعارالمتجر");
      expect(dto?.brandLogo).toContain("data:image/png");

      const detail = await getOnlineProduct(pid);
      expect(detail?.brandName).toBe("شعارالمتجر");
      expect(detail?.brandLogo).toContain("data:image/png");

      const search = await searchOnlineProducts({ search: "منتج بعلامة" });
      expect(search.items.find((p) => p.id === pid)?.brandName).toBe("شعارالمتجر");
    });

    it("defaults brand fields to empty when a product has no brand", async () => {
      const pid = await makeProduct({ name: "منتج بدون علامة", purchaseCost: 5, sellingPrice: 12, stock: 2 });
      const detail = await getOnlineProduct(pid);
      expect(detail?.brandName).toBe("");
      expect(detail?.brandLogo).toBe("");
    });
  });

  describe("Checkout, reservations & idempotency", () => {
    it("creates an order with server-derived prices and reserves stock", async () => {
      const pid = await makeProduct({ name: "منتج تشيك أوت", purchaseCost: 10, sellingPrice: 25.5, stock: 10 });

      const { order, trackingToken } = await createOnlineOrder(
        checkoutInput({
          items: [{ productId: pid, quantity: 3 }],
          idempotencyKey: crypto.randomUUID(),
        }),
      );

      expect(order.status).toBe("PENDING");
      expect(order.paymentState).toBe("PAYMENT_PENDING");
      expect(order.paymentCollected).toBe(false);
      expect(order.totalAmount).toBe(76.5); // 3 × 25.5
      expect(order.payableAmount).toBe(76.5);
      expect(order.orderNumber).toMatch(/^ON-\d{8}-\d{4}$/);
      expect(trackingToken.length).toBeGreaterThan(8);
      expect(order.items[0]).toMatchObject({ unitPrice: 25.5, quantity: 3, lineTotal: 76.5, reservedQuantity: 3 });

      const reservations = await InventoryReservationModel.find({ onlineOrder: order.id }).lean();
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe("RESERVED");
      expect(reservations[0]!.expiresAt.getTime() > Date.now()).toBe(true);
    });

    it("rejects submitting more than the free stock (no overselling)", async () => {
      const pid = await makeProduct({ name: "منتج محدود", purchaseCost: 10, sellingPrice: 20, stock: 5 });

      await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 3 }], idempotencyKey: "ov-1" }),
      );

      let caught: unknown;
      try {
        await createOnlineOrder(
          checkoutInput({ items: [{ productId: pid, quantity: 3 }], idempotencyKey: "ov-2" }),
        );
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");

      // Remaining 2 units can still be claimed.
      const second = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 2 }], idempotencyKey: "ov-3" }),
      );
      expect(second.order.items[0]?.quantity).toBe(2);
    });

    it("is idempotent: replaying the same key returns the same order without double reserving", async () => {
      const pid = await makeProduct({ name: "منتج آيدي", purchaseCost: 10, sellingPrice: 20, stock: 10 });
      const key = "idem-key-123";

      const first = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 4 }], idempotencyKey: key }),
      );
      const replay = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 4 }], idempotencyKey: key }),
      );

      expect(replay.order.id).toBe(first.order.id);
      expect(replay.trackingToken).toBe(first.trackingToken);

      const reservations = await InventoryReservationModel.find({ onlineOrder: first.order.id }).lean();
      expect(reservations).toHaveLength(1);
      expect(reservations[0]?.status).toBe("RESERVED");

      const stock = await getSellableStock(pid);
      expect(stock.sellable).toBe(10); // reservations do not decrement onHand
    });

    it("ignores client-supplied unit prices (server recomputes)", async () => {
      const pid = await makeProduct({ name: "منتج سعر", purchaseCost: 10, sellingPrice: 20, stock: 10 });
      const item = { productId: pid, quantity: 2 };
      const input = checkoutInput({ items: [item], idempotencyKey: crypto.randomUUID() });
      // The zod schema strips/disallows any unitPrice field; send plain items only.

      const { order } = await createOnlineOrder(input);
      expect(order.items[0]?.unitPrice).toBe(20);
      expect(order.totalAmount).toBe(40);
    });
  });

  describe("Tracking (guest, token-protected)", () => {
    it("returns the order for the correct token and rejects a wrong one", async () => {
      const pid = await makeProduct({ name: "منتج تتبع", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order, trackingToken } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );

      const tracked = await trackOnlineOrder(order.orderNumber, trackingToken);
      expect(tracked.id).toBe(order.id);

      let caught: unknown;
      try {
        await trackOnlineOrder(order.orderNumber, "WRONG-TOKEN-123");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("NOT_FOUND");
    });
  });

  describe("Admin order management & state machine", () => {
    it("lists/reads orders only with online.orders.read", async () => {
      const pid = await makeProduct({ name: "منتج إدارة", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const created = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 2 }], idempotencyKey: crypto.randomUUID() }),
      );

      const all = await listOnlineOrders(manager);
      expect(all.some((o) => o.id === created.order.id)).toBe(true);

      const one = await getOnlineOrder(manager, created.order.id);
      expect(one.id).toBe(created.order.id);

      const cashier = await cashierActor("cash_no_read_orders");
      let forbidden: unknown;
      try {
        await listOnlineOrders(cashier);
      } catch (e) {
        forbidden = e;
      }
      expect(forbidden).toBeInstanceOf(AppError);
      if (forbidden instanceof AppError) expect(forbidden.code).toBe("FORBIDDEN");
    });

    it("walks the admin ladder up to OUT_FOR_DELIVERY and rejects bare DELIVERED", async () => {
      const pid = await makeProduct({ name: "منتج سلم", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );

      // PENDING → CONFIRMED → PREPARING → READY_FOR_DELIVERY → OUT_FOR_DELIVERY.
      // DELIVERED must NOT be reachable via the generic transition: it would mark
      // the order terminal while no financial Sale is posted and reservations are
      // never fulfilled. DELIVERED is only valid via collectCodAndDeliver /
      // deliverPaidOnlineOrder (both post the Sale).
      const steps: OnlineOrderDto["status"][] = ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"];
      let state = order;
      for (const s of steps) {
        const res = await transitionOnlineOrder(manager, { orderId: state.id, targetStatus: s });
        expect(res.status).toBe(s);
        state = res;
      }
      expect(state.statusHistory.length).toBe(5); // initial PENDING + 4 transitions

      // A bare DELIVERED transition is rejected (financial integrity guard).
      let caught: unknown;
      try {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: "DELIVERED" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    });

    it("cancelling a pending order releases its reservations", async () => {
      const pid = await makeProduct({ name: "منتج إلغاء", purchaseCost: 10, sellingPrice: 20, stock: 4 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 4 }], idempotencyKey: crypto.randomUUID() }),
      );

      await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: "CANCELLED" });

      const reservations = await InventoryReservationModel.find({ onlineOrder: order.id }).lean();
      for (const r of reservations) expect(r.status).toBe("RELEASED");

      // Full stock is claimable again.
      const again = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 4 }], idempotencyKey: crypto.randomUUID() }),
      );
      expect(again.order.items[0]?.quantity).toBe(4);
    });

    it("assigns a delivery employee to an order", async () => {
      const pid = await makeProduct({ name: "منتج توزيع", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );
      const courier = await deliveryActor("delivery_assign");

      const assigned = await assignOnlineOrder(manager, {
        orderId: order.id,
        employeeId: courier.id,
        employeeUsername: courier.username,
      });
      expect(assigned.assignedTo?.id).toBe(courier.id);
    });
  });

  describe("Admin dashboard listing (server-filtered + paginated)", () => {
    // Single NON-financial ONLINE payment test in this block needs the gateway
    // stub so it never hits the network (capture itself is not exercised here).
    const gatewaySession = {
      _id: "test-session-admin",
      sessionUrl: "https://test-api.kashier.io/pay/test-session-admin",
    };
    beforeAll(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => gatewaySession,
        }),
      );
    });
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it("returns a bounded page with total counts and clamps an absurd page size", async () => {
      const pid = await makeProduct({ name: "منتج صفحة إدارة", purchaseCost: 10, sellingPrice: 20, stock: 20 });
      for (let i = 0; i < 7; i++) {
        await createOnlineOrder(
          checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: `page-admin-${i}` }),
        );
      }

      const res = await listOnlineOrdersPage(manager, { page: 1, pageSize: 3 });
      expect(res.items.length).toBe(3);
      expect(res.total).toBeGreaterThanOrEqual(7);
      expect(res.totalPages).toBe(Math.ceil(res.total / 3));

      const huge = await listOnlineOrdersPage(manager, { pageSize: 99999 });
      expect(huge.items.length).toBeLessThanOrEqual(100);
    });

    it("filters by status and payment method exactly", async () => {
      const pid = await makeProduct({ name: "منتج فلتر", purchaseCost: 10, sellingPrice: 20, stock: 20 });

      // A CONFIRMED COD order.
      const cod = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: "filter-cod" }),
      );
      await transitionOnlineOrder(manager, { orderId: cod.order.id, targetStatus: "CONFIRMED" });

      // A PENDING ONLINE order (uses the stubbed Kashier gateway).
      const online = await createOnlineOrder(
        {
          ...checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: "filter-online" }),
          paymentMethod: "ONLINE",
        },
      );

      const confirmed = await listOnlineOrdersPage(manager, { status: "CONFIRMED" });
      expect(confirmed.items.map((o) => o.id)).toContain(cod.order.id);
      expect(confirmed.items.map((o) => o.id)).not.toContain(online.order.id);

      const onlineOnly = await listOnlineOrdersPage(manager, { paymentMethod: "ONLINE" });
      const onlineIds = onlineOnly.items.map((o) => o.id);
      expect(onlineIds).toContain(online.order.id);
      expect(onlineIds).not.toContain(cod.order.id);

      const pendingEverything = await listOnlineOrdersPage(manager, { paymentState: "PAYMENT_PENDING" });
      expect(pendingEverything.items.map((o) => o.id)).toContain(online.order.id);
      expect(pendingEverything.items.map((o) => o.id)).toContain(cod.order.id);
    });

    it("searches by order number, customer name and phone", async () => {
      const pid = await makeProduct({ name: "منتج بحث", purchaseCost: 10, sellingPrice: 20, stock: 20 });
      const order = await createOnlineOrder(
        checkoutInput({
          items: [{ productId: pid, quantity: 1 }],
          idempotencyKey: "search-orders-1",
          customerName: "أحمد عبد الله",
          customerPhone: "01234567890",
        }),
      );

      const byNumber = await listOnlineOrdersPage(manager, { search: order.order.orderNumber });
      expect(byNumber.items.map((o) => o.id)).toContain(order.order.id);

      const byName = await listOnlineOrdersPage(manager, { search: "أحمد" });
      expect(byName.items.map((o) => o.id)).toContain(order.order.id);

      const byPhone = await listOnlineOrdersPage(manager, { search: "12345" });
      expect(byPhone.items.map((o) => o.id)).toContain(order.order.id);

      const none = await listOnlineOrdersPage(manager, { search: "لا-يوجد-مطابق" });
      expect(none.items).toHaveLength(0);
      expect(none.total).toBe(0);
    });

    it("filters by a created date range", async () => {
      const pid = await makeProduct({ name: "منتج تاريخ", purchaseCost: 10, sellingPrice: 20, stock: 20 });
      const order = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: "date-range-1" }),
      );
      const day = order.order.createdAt.slice(0, 10);

      const inRange = await listOnlineOrdersPage(manager, {
        from: `${day}T00:00:00`,
        to: `${day}T23:59:59`,
      });
      expect(inRange.items.map((o) => o.id)).toContain(order.order.id);

      const before = await listOnlineOrdersPage(manager, { from: "2000-01-01", to: "2000-01-02" });
      expect(before.items.map((o) => o.id)).not.toContain(order.order.id);
    });

    it("enforces online.orders.read for the dashboard listing", async () => {
      const cashier = await cashierActor("cash_page_read");
      let forbidden: unknown;
      try {
        await listOnlineOrdersPage(cashier, {});
      } catch (e) {
        forbidden = e;
      }
      expect(forbidden).toBeInstanceOf(AppError);
      if (forbidden instanceof AppError) expect(forbidden.code).toBe("FORBIDDEN");
    });

    it("cancels a PENDING order through the state machine (allowed target)", async () => {
      const pid = await makeProduct({ name: "منتج إلغاء صفحة", purchaseCost: 10, sellingPrice: 20, stock: 10 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: "cancel-page-1" }),
      );

      const cancelled = await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: "CANCELLED" });
      expect(cancelled.status).toBe("CANCELLED");

      const list = await listOnlineOrdersPage(manager, { status: "CANCELLED" });
      expect(list.items.map((o) => o.id)).toContain(order.id);

      // A terminal order cannot be advanced again.
      let caught: unknown;
      try {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: "CONFIRMED" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    });
  });

  describe("Delivery scope & RBAC", () => {
    it("a delivery employee sees only ready/unassigned or their own orders", async () => {
      const pid = await makeProduct({ name: "منتج سكوب", purchaseCost: 10, sellingPrice: 20, stock: 20 });
      const orderA = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );
      const orderB = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );

      const courier = await deliveryActor("delivery_scope_a");
      await assignOnlineOrder(manager, { orderId: orderB.order.id, employeeId: courier.id, employeeUsername: courier.username });

      // orderA remains PENDING → not in scope. orderB is assigned but PENDING → assigned scope picks it up.
      const scope = await listDeliveryOrders(courier);
      const ids = scope.map((o) => o.id);
      expect(ids).toContain(orderB.order.id);
      expect(ids).not.toContain(orderA.order.id);

      // Promotes orderA to READY_FOR_DELIVERY (unassigned) — now visible to delivery.
      await transitionOnlineOrder(manager, { orderId: orderA.order.id, targetStatus: "CONFIRMED" });
      await transitionOnlineOrder(manager, { orderId: orderA.order.id, targetStatus: "PREPARING" });
      await transitionOnlineOrder(manager, { orderId: orderA.order.id, targetStatus: "READY_FOR_DELIVERY" });
      const scope2 = await listDeliveryOrders(courier);
      expect(scope2.map((o) => o.id)).toContain(orderA.order.id);
    });

    it("delivery cannot run the admin ladder, but can advance to OUT_FOR_DELIVERY", async () => {
      const pid = await makeProduct({ name: "منتج صلاحيات", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );
      const courier = await deliveryActor("delivery_ladder_block");

      // Advance to READY_FOR_DELIVERY first as manager.
      for (const s of ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY"] as OnlineOrderDto["status"][]) {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: s });
      }

      // Delivery employee can dispatch.
      const out = await transitionOnlineOrder(courier, { orderId: order.id, targetStatus: "OUT_FOR_DELIVERY" });
      expect(out.status).toBe("OUT_FOR_DELIVERY");

      // Delivery employee cannot mark DELIVERED without collecting COD.
      let caught: unknown;
      try {
        await transitionOnlineOrder(courier, { orderId: order.id, targetStatus: "DELIVERED" });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");

      // Delivery cannot confirm (upstream ladder) a fresh order either.
      const pid2 = await makeProduct({ name: "منتج لادير", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const fresh = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid2, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );
      let forbidden: unknown;
      try {
        await transitionOnlineOrder(courier, { orderId: fresh.order.id, targetStatus: "CONFIRMED" });
      } catch (e) {
        forbidden = e;
      }
      expect(forbidden).toBeInstanceOf(AppError);
      if (forbidden instanceof AppError) expect(forbidden.code).toBe("FORBIDDEN");
    });
  });

  describe("COD collection at delivery (financial integration)", () => {
    it("requires an open shift for the collecting employee", async () => {
      const pid = await makeProduct({ name: "منتج بلا وردية", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );
      for (const s of ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] as OnlineOrderDto["status"][]) {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: s });
      }
      const courier = await deliveryActor("delivery_no_shift");

      let caught: unknown;
      try {
        await collectCodAndDeliver(courier, order.id);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    });

    it("posts the Sale into the collector's shift, delivers, fulfills reservations", async () => {
      const pid = await makeProduct({ name: "منتج كاش ديل", purchaseCost: 10, sellingPrice: 30, stock: 8 });
      const { order } = await createOnlineOrder(
        checkoutInput({
          items: [{ productId: pid, quantity: 2 }],
          idempotencyKey: crypto.randomUUID(),
          customerName: "عميل كاش",
        }),
      );
      for (const s of ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] as OnlineOrderDto["status"][]) {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: s });
      }

      const courier = await deliveryActor("delivery_collect");
      await openShift(courier, { openingCash: 0 });

      const res = await collectCodAndDeliver(courier, order.id);
      expect(res.status).toBe("DELIVERED");
      expect(res.paymentState).toBe("PAID_AT_DELIVERY");
      expect(res.paymentCollected).toBe(true);
      expect(res.invoiceNumber.length).toBeGreaterThan(0);
      expect(res.codCollectedAt).toBeTruthy();
      expect(res.saleId).toBeTruthy();

      // The Sale exists and carries the full COD amount as cash.
      const sale = await getSale(manager, res.saleId!);
      expect(sale.totalAmount).toBe(60);
      expect(sale.payments.some((p) => p.method === "CASH" && p.amount === 60)).toBe(true);

      // Reservations fulfilled + onHand actually consumed.
      const reservations = await InventoryReservationModel.find({ onlineOrder: order.id }).lean();
      for (const r of reservations) expect(r.status).toBe("FULFILLED");
      const stock = await getSellableStock(pid);
      expect(stock.sellable).toBe(6);

      // Re-collection is rejected (idempotent financial record).
      let caught: unknown;
      try {
        await collectCodAndDeliver(courier, order.id);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    });

    it("rejects collection by a role without delivery/sales permission", async () => {
      const pid = await makeProduct({ name: "منتج حرام", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order } = await createOnlineOrder(
        checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }),
      );
      for (const s of ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] as OnlineOrderDto["status"][]) {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: s });
      }

      const cashier = await cashierActor("cash_collect_attempt");
      await openShift(cashier, { openingCash: 0 });

      let caught: unknown;
      try {
        await collectCodAndDeliver(cashier, order.id);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
    });
  });

  describe("Catalog search, filters & pagination (bounded)", () => {
    it("filters by free-text, category and only returns online-visible products", async () => {
      const catA = await createCategory(manager, { name: "فئة سيرش أ" });
      const found = await createProduct(manager, {
        name: "قهوة احترافية",
        categoryId: catA.id,
        unit: "قطعة",
        purchaseCost: 100,
        sellingPrice: 500,
        minimumStock: 0,
        onlineVisible: true,
      });
      await createProduct(manager, {
        name: "غلاية شاي",
        categoryId: catA.id,
        unit: "قطعة",
        purchaseCost: 20,
        sellingPrice: 80,
        minimumStock: 0,
        onlineVisible: true,
      });
      await createProduct(manager, {
        name: "لابتوب مكتبي",
        categoryId: catA.id,
        unit: "قطعة",
        purchaseCost: 500,
        sellingPrice: 2000,
        minimumStock: 0,
        onlineVisible: false, // hidden from search
      });

      const named = await searchOnlineProducts({
        search: "قهوة",
        categoryId: catA.id,
      });
      expect(named.items.map((p) => p.id)).toContain(found.id);
      expect(named.items.length).toBe(1);

      const all = await searchOnlineProducts({ categoryId: catA.id });
      expect(all.items.length).toBe(2);
    });

    it("paginates results with a bounded page size", async () => {
      const cat = await createCategory(manager, { name: "فئة بادجينج" });
      const ids: string[] = [];
      for (let i = 0; i < 5; i++) {
        const p = await createProduct(manager, {
          name: `منتج صفحة ${i}`,
          categoryId: cat.id,
          unit: "قطعة",
          purchaseCost: 1,
          sellingPrice: 2,
          minimumStock: 0,
          onlineVisible: true,
        });
        ids.push(p.id);
      }

      const page = await searchOnlineProducts({ categoryId: cat.id, pageSize: 2, page: 1 });
      expect(page.items.length).toBe(2);
      expect(page.total).toBe(5);
      expect(page.totalPages).toBe(3);
    });

    it("clamps page numbers and an unreasonably large pageSize", async () => {
      const cat = await createCategory(manager, { name: "فئة كلامب" });
      for (let i = 0; i < 3; i++) {
        await createProduct(manager, {
          name: `منتج كلامب ${i}`,
          categoryId: cat.id,
          unit: "قطعة",
          purchaseCost: 1,
          sellingPrice: 2,
          minimumStock: 0,
          onlineVisible: true,
        });
      }
      // pageSize 9999 → clamped to ONLINE_PAGE_SIZE_MAX; page beyond total → clamped to last page.
      const res = await searchOnlineProducts({ categoryId: cat.id, pageSize: 9999, page: 99 });
      expect(res.items.length).toBeLessThanOrEqual(48);
      expect(res.page).toBeLessThanOrEqual(1);
    });

    it("getOnlineCategories only returns categories with live online products", async () => {
      const emptyCat = await createCategory(manager, { name: "فئة بلا منتجات" });
      const activeCat = await createCategory(manager, { name: "فئة نشطة" });
      await createProduct(manager, {
        name: "منتج فئة نشطة",
        categoryId: activeCat.id,
        unit: "قطعة",
        purchaseCost: 1,
        sellingPrice: 2,
        minimumStock: 0,
        onlineVisible: true,
      });

      const cats = await getOnlineCategories();
      expect(cats.some((c) => c.id === activeCat.id)).toBe(true);
      expect(cats.some((c) => c.id === emptyCat.id)).toBe(false);
    });
  });

  describe("Online payment: webhook capture & delivery (non-cash)", () => {
    // The ONLINE checkout path creates a Kashier payment session via an external
    // fetch. Stub the gateway so tests never hit the network and never fabricate
    // a "paid" state — the capture is still driven by markOnlineOrderPaid below.
    const gatewaySession = {
      _id: "test-session",
      sessionUrl: "https://test-api.kashier.io/pay/test-session",
    };
    beforeAll(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => gatewaySession,
        }),
      );
    });
    afterAll(() => {
      vi.unstubAllGlobals();
    });

    it("markOnlineOrderPaid flips a pending ONLINE order to PAID_ONLINE (webhook path)", async () => {
      const pid = await makeProduct({ name: "منتج دفع أونلاين", purchaseCost: 10, sellingPrice: 40, stock: 5 });
      const { order } = await createOnlineOrder(
        { ...checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }), paymentMethod: "ONLINE" },
      );
      expect(order.paymentState).toBe("PAYMENT_PENDING");
      expect(order.paymentCollected).toBe(false);

      // Phase 9.3: a pending payment reference is persisted before the redirect,
      // so it survives refresh and is never forged by the client.
      expect(order.onlinePayment?.sessionId).toBe("test-session");
      expect(order.onlinePayment?.paymentToken).toBeTruthy();
      expect(order.onlinePayment?.initiatedAt).toBeTruthy();
      expect(order.paymentMethod).toBe("ONLINE");

      await markOnlineOrderPaid({
        orderNumber: order.orderNumber,
        amount: order.payableAmount,
        transactionId: "kash-txn-1",
        status: "PAID",
      });

      const paid = await getOnlineOrder(manager, order.id);
      expect(paid.paymentState).toBe("PAID_ONLINE");
      expect(paid.paymentCollected).toBe(true);
      expect(paid.onlinePayment?.transactionId).toBe("kash-txn-1");

      // Idempotent replay is a safe no-op (does not throw).
      await markOnlineOrderPaid({ orderNumber: order.orderNumber, amount: order.payableAmount });
    });

    it("rejects a capture whose amount mismatches the order payable", async () => {
      const pid = await makeProduct({ name: "منتج تطابق", purchaseCost: 10, sellingPrice: 40, stock: 5 });
      const { order } = await createOnlineOrder(
        { ...checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }), paymentMethod: "ONLINE" },
      );

      let caught: unknown;
      try {
        await markOnlineOrderPaid({ orderNumber: order.orderNumber, amount: 1 });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    });

    it("deliverPaidOnlineOrder posts a non-cash ONLINE Sale into an open shift", async () => {
      const pid = await makeProduct({ name: "منتج تسليم أونلاين", purchaseCost: 10, sellingPrice: 30, stock: 8 });
      const { order } = await createOnlineOrder(
        {
          ...checkoutInput({ items: [{ productId: pid, quantity: 2 }], idempotencyKey: crypto.randomUUID() }),
          paymentMethod: "ONLINE",
        },
      );
      for (const s of ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] as OnlineOrderDto["status"][]) {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: s });
      }

      // Capture the online payment (webhook) before delivery.
      await markOnlineOrderPaid({ orderNumber: order.orderNumber, amount: order.payableAmount, transactionId: "kash-txn-2" });

      const courier = await deliveryActor("delivery_online_paid");
      await openShift(courier, { openingCash: 0 });

      const res = await deliverPaidOnlineOrder(courier, order.id);
      expect(res.status).toBe("DELIVERED");
      expect(res.paymentState).toBe("PAID_ONLINE");
      expect(res.paymentCollected).toBe(true);
      expect(res.saleId).toBeTruthy();

      const sale = await getSale(manager, res.saleId!);
      expect(sale.totalAmount).toBe(60);
      expect(sale.payments.some((p) => p.method === "ONLINE" && p.amount === 60)).toBe(true);

      const stock = await getSellableStock(pid);
      expect(stock.sellable).toBe(6);
    });

    it("refuses delivery of an ONLINE order whose payment is not yet captured", async () => {
      const pid = await makeProduct({ name: "منتج بلا دفع", purchaseCost: 10, sellingPrice: 20, stock: 5 });
      const { order } = await createOnlineOrder(
        { ...checkoutInput({ items: [{ productId: pid, quantity: 1 }], idempotencyKey: crypto.randomUUID() }), paymentMethod: "ONLINE" },
      );
      for (const s of ["CONFIRMED", "PREPARING", "READY_FOR_DELIVERY", "OUT_FOR_DELIVERY"] as OnlineOrderDto["status"][]) {
        await transitionOnlineOrder(manager, { orderId: order.id, targetStatus: s });
      }

      const courier = await deliveryActor("delivery_online_unpaid");
      await openShift(courier, { openingCash: 0 });

      let caught: unknown;
      try {
        await deliverPaidOnlineOrder(courier, order.id);
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(AppError);
      if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    });
  });
});