import { describe, it, expect, beforeAll } from "vitest";
import type mongoose from "mongoose";
import { AppError } from "@/lib/errors";
import { createCategory, createProduct } from "@/services/catalog.service";
import {
  adjustStock,
  performStockCount,
  recordDamage,
  getSellableStock,
  getLowStockProducts,
  getOutOfStockProducts,
  getReplenishmentSuggestions,
  getExpiryBatches,
  getExpirySummary,
  disposeExpired,
  listMovements,
  listProductBatches,
} from "@/services/inventory.service";
import { ProductBatchModel } from "@/models/product-batch";
import { InventoryStateModel } from "@/models/inventory-state";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

let manager: Awaited<ReturnType<typeof buildAuthUser>>;
let accountant: Awaited<ReturnType<typeof buildAuthUser>>;
let categoryId: string;

function daysFromNow(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function makeProduct(opts: { name: string; minimumStock?: number; trackExpiry?: boolean; sku?: string }) {
  return createProduct(manager, {
    name: opts.name,
    sku: opts.sku,
    categoryId,
    unit: "قطعة",
    purchaseCost: 1,
    sellingPrice: 2,
    minimumStock: opts.minimumStock ?? 0,
    trackExpiry: opts.trackExpiry ?? false,
    onlineVisible: false,
    active: true,
  });
}

async function addBatch(
  productId: string,
  opts: { code: string; quantity: number; expiryDate: Date },
): Promise<mongoose.Types.ObjectId> {
  const doc = new ProductBatchModel({
    product: productId,
    batchCode: opts.code,
    quantity: opts.quantity,
    expiryDate: opts.expiryDate,
    sourceReference: "",
  });
  const saved = await doc.save();
  return saved._id as mongoose.Types.ObjectId;
}

describe("inventory / stock", () => {
  beforeAll(async () => {
    await resetDb();
    manager = await buildAuthUser(await createUser({ username: "mgr", role: "MANAGER" }));
    accountant = await buildAuthUser(await createUser({ username: "acct", role: "ACCOUNTANT" }));
    categoryId = (await createCategory(manager, { name: "مخزن" })).id;
  });

  it("adjusts stock up and records a movement", async () => {
    const p = await makeProduct({ name: "تعديل+" });
    const before = await getSellableStock(p.id, false);
    expect(before.sellable).toBe(0);
    const after = await adjustStock(manager, { productId: p.id, quantity: 10, reason: "إدخال يدوي" });
    expect(after.sellable).toBe(10);
    const movements = await listMovements(manager, {
      productId: p.id,
      page: 1,
      pageSize: 10,
    });
    expect(movements.total).toBeGreaterThanOrEqual(1);
    expect(movements.movements[0]?.type).toBe("ADJUSTMENT");
  });

  it("rejects a negative adjustment below zero (insufficient stock)", async () => {
    const p = await makeProduct({ name: "تعديل-" });
    await adjustStock(manager, { productId: p.id, quantity: 3, reason: "زيادة" });
    let caught: unknown;
    try {
      await adjustStock(manager, { productId: p.id, quantity: -5, reason: "نقص" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
    const s = await getSellableStock(p.id, false);
    expect(s.sellable).toBe(3);
  });

  it("reconciles a physical count via STOCK_COUNT delta", async () => {
    const p = await makeProduct({ name: "جرد" });
    await adjustStock(manager, { productId: p.id, quantity: 7, reason: "إدخال" });
    const up = await performStockCount(manager, { productId: p.id, countedQuantity: 10, note: "وجدنا 10" });
    expect(up.sellable).toBe(10);
    const down = await performStockCount(manager, { productId: p.id, countedQuantity: 4, note: "نقص فعلي" });
    expect(down.sellable).toBe(4);
  });

  it("increments the inventory state version on each mutation", async () => {
    const p = await makeProduct({ name: "الإصدار" });
    const before = await InventoryStateModel.findOne({ product: p.id }).lean();
    expect(before?.version).toBe(1);
    await adjustStock(manager, { productId: p.id, quantity: 2, reason: "زيادة" });
    await adjustStock(manager, { productId: p.id, quantity: -1, reason: "نقص" });
    const after = await InventoryStateModel.findOne({ product: p.id }).lean();
    expect(after?.version).toBe(3);
  });

  it("records damage and tracks it as non-sellable", async () => {
    const p = await makeProduct({ name: "تالف" });
    await adjustStock(manager, { productId: p.id, quantity: 10, reason: "إدخال" });
    const r = await recordDamage(manager, { productId: p.id, quantity: 2, reason: "كسر أثناء النقل" });
    expect(r.nonSellable).toBe(2);
  });

  it("blocks stock adjustment for an unauthorized actor", async () => {
    const p = await makeProduct({ name: "غير مسموح" });
    let caught: unknown;
    try {
      await adjustStock(accountant, { productId: p.id, quantity: 1, reason: "محاولة" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("flags low and out-of-stock based on sellable vs minimum", async () => {
    const low = await makeProduct({ name: "نقص المنخفض", minimumStock: 10 });
    await adjustStock(manager, { productId: low.id, quantity: 10, reason: "إدخال" }); // sellable == minimum -> low
    const none = await makeProduct({ name: "ناقص", minimumStock: 5 });
    await adjustStock(manager, { productId: none.id, quantity: 8, reason: "إدخال" }); // above minimum

    const lowList = await getLowStockProducts(manager);
    expect(lowList.some((p) => p.id === low.id)).toBe(true);
    expect(lowList.some((p) => p.id === none.id)).toBe(false);

    const zero = await makeProduct({ name: "نفد" });
    const out = await getOutOfStockProducts(manager);
    expect(out.some((p) => p.id === zero.id)).toBe(true);
  });

  it("suggests replenishment only when sellable < minimum", async () => {
    const need = await makeProduct({ name: "يحتاج توريد", minimumStock: 20 });
    await adjustStock(manager, { productId: need.id, quantity: 5, reason: "إدخال" }); // 5 < 20 -> suggested 15
    const ok = await makeProduct({ name: "مكتمل", minimumStock: 10 });
    await adjustStock(manager, { productId: ok.id, quantity: 20, reason: "إدخال" }); // 20 >= 10 -> none

    const suggestions = await getReplenishmentSuggestions(manager);
    const needS = suggestions.find((s) => s.id === need.id);
    const okS = suggestions.find((s) => s.id === ok.id);
    expect(needS?.suggested).toBe(15);
    expect(okS).toBeUndefined();
  });

  it("treats only non-expired batches as sellable for expiry products", async () => {
    const p = await makeProduct({ name: "منتهي", trackExpiry: true });
    await addBatch(p.id, { code: "B-FUTURE", quantity: 5, expiryDate: daysFromNow(60) });
    await addBatch(p.id, { code: "B-EXPIRED", quantity: 3, expiryDate: daysFromNow(-1) });
    const stock = await getSellableStock(p.id, true);
    expect(stock.sellable).toBe(5); // expired batch not counted
    const batches = await listProductBatches(manager, p.id);
    expect(batches.some((b) => b.expired)).toBe(true);
  });

  it("lists expired and expiring batches", async () => {
    const p = await makeProduct({ name: "صلاحية", trackExpiry: true });
    await addBatch(p.id, { code: "EXP-LIST-1", quantity: 2, expiryDate: daysFromNow(-2) }); // expired
    await addBatch(p.id, { code: "EXP-LIST-2", quantity: 2, expiryDate: daysFromNow(10) }); // expiring soon
    const batches = await getExpiryBatches(manager);
    expect(batches.some((b) => b.batchCode === "EXP-LIST-1" && b.status === "expired")).toBe(true);
    expect(batches.some((b) => b.batchCode === "EXP-LIST-2" && b.status === "expiring")).toBe(true);
    const summary = await getExpirySummary(manager);
    expect(summary.expiredCount).toBeGreaterThanOrEqual(1);
    expect(summary.expiringCount).toBeGreaterThanOrEqual(1);
  });

  it("disposes only actually-expired batches", async () => {
    const p = await makeProduct({ name: "تخلص", trackExpiry: true });
    const expiredId = await addBatch(p.id, { code: "DISP-EXP", quantity: 4, expiryDate: daysFromNow(-3) });
    const futureId = await addBatch(p.id, { code: "DISP-FUT", quantity: 4, expiryDate: daysFromNow(30) });

    let caught: unknown;
    try {
      await disposeExpired(manager, { batchId: futureId.toString() });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("VALIDATION");

    const disposed = await disposeExpired(manager, { batchId: expiredId.toString() });
    expect(disposed.quantity).toBe(4);
    const stock = await getSellableStock(p.id, true);
    expect(stock.sellable).toBe(4); // only the future batch remains
  });

  it("exposes movements to viewers with permission", async () => {
    const p = await makeProduct({ name: "حركات" });
    await adjustStock(manager, { productId: p.id, quantity: 1, reason: "إدخال" });
    const accountantView = await listMovements(accountant, { page: 1, pageSize: 10 });
    expect(accountantView.total).toBeGreaterThanOrEqual(1);

    const cashier = await buildAuthUser(await createUser({ username: "cash2", role: "CASHIER" }));
    let caught: unknown;
    try {
      await listMovements(cashier, { page: 1, pageSize: 10 });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });
});
