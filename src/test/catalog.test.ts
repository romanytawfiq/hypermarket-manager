import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createCategory,
  createBrand,
  createProduct,
  updateProduct,
  setProductActive,
  getProduct,
  listProducts,
} from "@/services/catalog.service";
import { getSellableStock } from "@/services/inventory.service";
import { InventoryStateModel } from "@/models/inventory-state";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

async function managerActor() {
  const m = await createUser({ username: "mgr", role: "MANAGER" });
  return buildAuthUser(m);
}

async function cashierActor() {
  const c = await createUser({ username: "cash", role: "CASHIER" });
  return buildAuthUser(c);
}

describe("catalog / products", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;
  let categoryId: string;
  let brandId: string;

  beforeAll(async () => {
    await resetDb();
    manager = await managerActor();
    const category = await createCategory(manager, { name: "مشروبات" });
    const brand = await createBrand(manager, { name: "بيبسي" });
    categoryId = category.id;
    brandId = brand.id;
  });

  it("creates a product and its initial inventory state", async () => {
    const product = await createProduct(manager, {
      name: "كولا 1 لتر",
      barcode: "6220",
      sku: "COLA-1",
      categoryId,
      brandId,
      unit: "زجاجة",
      purchaseCost: 20,
      sellingPrice: 30,
      minimumStock: 5,
      trackExpiry: false,
    });
    expect(product.name).toBe("كولا 1 لتر");
    expect(product.sellable).toBe(0);
    const state = await InventoryStateModel.findOne({ product: product.id }).lean();
    expect(state).toBeTruthy();
    if (state) expect(state.version).toBe(1);
  });

  it("rejects a duplicate barcode (CONFLICT)", async () => {
    await createProduct(manager, {
      name: "منتج بباركود",
      barcode: "DUPE-BARCODE",
      categoryId,
      unit: "قطعة",
      purchaseCost: 1,
      sellingPrice: 2,
      minimumStock: 0,
    });
    let caught: unknown;
    try {
      await createProduct(manager, {
        name: "منتج آخر",
        barcode: "DUPE-BARCODE",
        categoryId,
        unit: "قطعة",
        purchaseCost: 1,
        sellingPrice: 2,
        minimumStock: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("rejects a duplicate SKU (CONFLICT)", async () => {
    await createProduct(manager, {
      name: "بـ SKU",
      sku: "SKU-DUPE",
      categoryId,
      unit: "قطعة",
      purchaseCost: 1,
      sellingPrice: 2,
      minimumStock: 0,
    });
    let caught: unknown;
    try {
      await createProduct(manager, {
        name: "ثاني",
        sku: "SKU-DUPE",
        categoryId,
        unit: "قطعة",
        purchaseCost: 1,
        sellingPrice: 2,
        minimumStock: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("blocks product creation without products.create", async () => {
    const cashier = await cashierActor();
    let caught: unknown;
    try {
      await createProduct(cashier, {
        name: "غير مسموح",
        categoryId,
        unit: "قطعة",
        purchaseCost: 1,
        sellingPrice: 2,
        minimumStock: 0,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });

  it("updates a product and rejects a change to an existing barcode", async () => {
    const p = await createProduct(manager, {
      name: "محدث",
      categoryId,
      unit: "قطعة",
      purchaseCost: 10,
      sellingPrice: 20,
      minimumStock: 2,
      barcode: "BAR-UPD",
    });
    const updated = await updateProduct(manager, p.id, {
      sellingPrice: 25,
      minimumStock: 4,
      name: "محدث نهائي",
    });
    expect(updated.sellingPrice).toBe(25);
    expect(updated.minimumStock).toBe(4);
    expect(updated.name).toBe("محدث نهائي");

    // Try to set barcode to an existing one.
    await createProduct(manager, {
      name: "يملك الباركود",
      barcode: "EXISTING-BAR",
      categoryId,
      unit: "قطعة",
      purchaseCost: 1,
      sellingPrice: 2,
      minimumStock: 0,
    });
    let caught: unknown;
    try {
      await updateProduct(manager, p.id, { barcode: "EXISTING-BAR" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("CONFLICT");
  });

  it("deactivates a product but keeps the record (no physical delete)", async () => {
    const p = await createProduct(manager, {
      name: "سيُعطَّل",
      categoryId,
      unit: "قطعة",
      purchaseCost: 1,
      sellingPrice: 2,
      minimumStock: 0,
    });
    const deactivated = await setProductActive(manager, p.id, false);
    expect(deactivated.active).toBe(false);
    const fetched = await getProduct(manager, p.id);
    expect(fetched.active).toBe(false);
    expect(fetched.id).toBe(p.id);
  });

  it("lists and searches products", async () => {
    await createProduct(manager, {
      name: "بحث خاص",
      barcode: "SRCH-1",
      categoryId,
      unit: "قطعة",
      purchaseCost: 3,
      sellingPrice: 6,
      minimumStock: 0,
    });
    const result = await listProducts(manager, { q: "بحث خاص", status: "all", page: 1, pageSize: 10 });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.items.some((i) => i.name === "بحث خاص")).toBe(true);
  });

  it("computes sellable from inventory state for non-expiry products", async () => {
    const p = await createProduct(manager, {
      name: "بالكمية",
      categoryId,
      unit: "قطعة",
      purchaseCost: 1,
      sellingPrice: 2,
      minimumStock: 0,
    });
    const stock = await getSellableStock(p.id, false);
    expect(stock.sellable).toBe(0);
  });
});
