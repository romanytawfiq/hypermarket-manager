import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import {
  createCategory,
  updateCategory,
  listCategories,
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

describe("category café sugar configuration (Phase 7.1 → category-based)", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;

  beforeAll(async () => {
    await resetDb();
    manager = await managerActor();
  });

  it("defaults a new category to supportsSugarOptions = false", async () => {
    const cat = await createCategory(manager, { name: "سكر افتراضي" });
    expect(cat.supportsSugarOptions).toBe(false);
  });

  it("creates a category with sugar capability enabled and lists it back", async () => {
    const cat = await createCategory(manager, { name: "مشروبات ساخنة", supportsSugarOptions: true });
    expect(cat.supportsSugarOptions).toBe(true);

    const cats = await listCategories(manager);
    const found = cats.find((c) => c.id === cat.id);
    expect(found?.supportsSugarOptions).toBe(true);
  });

  it("toggles sugar capability on an existing category", async () => {
    const cat = await createCategory(manager, { name: "عصائر", supportsSugarOptions: false });
    expect(cat.supportsSugarOptions).toBe(false);
    const enabled = await updateCategory(manager, cat.id, { name: "عصائر", supportsSugarOptions: true });
    expect(enabled.supportsSugarOptions).toBe(true);
    const disabled = await updateCategory(manager, cat.id, { name: "عصائر", supportsSugarOptions: false });
    expect(disabled.supportsSugarOptions).toBe(false);
  });

  it("derives a product's sugar capability from its category (create + read)", async () => {
    const sugarCat = await createCategory(manager, { name: "قهوة المعاينة", supportsSugarOptions: true });
    const plainCat = await createCategory(manager, { name: "معجنات المعاينة", supportsSugarOptions: false });

    const sugarProduct = await createProduct(manager, {
      name: "قهوة معاينة",
      categoryId: sugarCat.id,
      unit: "كوب",
      purchaseCost: 5,
      sellingPrice: 10,
      minimumStock: 0,
    });
    const plainProduct = await createProduct(manager, {
      name: "معجنات معاينة",
      categoryId: plainCat.id,
      unit: "قطعة",
      purchaseCost: 3,
      sellingPrice: 7,
      minimumStock: 0,
    });

    expect(sugarProduct.supportsSugarOptions).toBe(true);
    expect(plainProduct.supportsSugarOptions).toBe(false);

    const fetchedSugar = await getProduct(manager, sugarProduct.id);
    const fetchedPlain = await getProduct(manager, plainProduct.id);
    expect(fetchedSugar.supportsSugarOptions).toBe(true);
    expect(fetchedPlain.supportsSugarOptions).toBe(false);

    const listed = await listProducts(manager, { status: "all", page: 1, pageSize: 50 });
    expect(listed.items.find((i) => i.id === sugarProduct.id)?.supportsSugarOptions).toBe(true);
    expect(listed.items.find((i) => i.id === plainProduct.id)?.supportsSugarOptions).toBe(false);
  });

  it("a product's capability follows its category when the category is updated", async () => {
    const cat = await createCategory(manager, { name: "مؤقتة للمتابعة", supportsSugarOptions: false });
    const p = await createProduct(manager, {
      name: "منتج يتبع الفئة",
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: 1,
      sellingPrice: 2,
      minimumStock: 0,
    });
    expect(p.supportsSugarOptions).toBe(false);

    await updateCategory(manager, cat.id, { name: "مؤقتة للمتابعة", supportsSugarOptions: true });
    const refetched = await getProduct(manager, p.id);
    expect(refetched.supportsSugarOptions).toBe(true);
  });
});
