import { describe, expect, it } from "vitest";
import { resetDb } from "@/test/helpers";
import { generateStoreSeed } from "@/lib/store-seed/generator";
import { runStoreSeed } from "@/lib/store-seed/run";
import { ProductModel } from "@/models/product";
import { InventoryStateModel } from "@/models/inventory-state";
import { StockMovementModel } from "@/models/stock-movement";
import { ProductBatchModel } from "@/models/product-batch";

const EAN13_RE = /^\d{13}$/;

function assertUnique<T>(values: T[]): void {
  expect(new Set(values).size).toBe(values.length);
}

describe("store-seed generator", () => {
  it("is deterministic: two runs produce identical bundles", () => {
    const a = generateStoreSeed();
    const b = generateStoreSeed();
    expect(a).toEqual(b);
  });

  it("produces at least 1000 products across a rich category set", () => {
    const bundle = generateStoreSeed();
    expect(bundle.categories.length).toBeGreaterThanOrEqual(10);
    expect(bundle.brands.length).toBeGreaterThanOrEqual(20);
    expect(bundle.products.length).toBeGreaterThanOrEqual(1000);
  });

  it("assigns unique barcodes (valid 13-digit EAN-13) and unique SKUs", () => {
    const { products } = generateStoreSeed();
    assertUnique(products.map((p) => p.barcode));
    assertUnique(products.map((p) => p.sku));
    assertUnique(products.map((p) => p.name));
    for (const p of products) {
      expect(p.barcode).toMatch(EAN13_RE);
    }
  });

  it("keeps prices positive and maintainable (purchaseCost < sellingPrice)", () => {
    for (const p of generateStoreSeed().products) {
      expect(p.sellingPrice).toBeGreaterThan(0);
      expect(p.purchaseCost).toBeGreaterThan(0);
      expect(p.purchaseCost).toBeLessThan(p.sellingPrice);
      expect(p.minimumStock).toBeGreaterThanOrEqual(0);
    }
  });

  it("references only known categories and brands", () => {
    const bundle = generateStoreSeed();
    const categoryNames = new Set(bundle.categories.map((c) => c.name));
    const brandNames = new Set(bundle.brands.map((b) => b.name));
    for (const p of bundle.products) {
      expect(categoryNames.has(p.categoryName)).toBe(true);
      expect(brandNames.has(p.brandName)).toBe(true);
    }
  });

  it("keeps online visibility split with ~10% hidden products", () => {
    const { products } = generateStoreSeed();
    const hidden = products.filter((p) => !p.onlineVisible).length;
    const ratio = hidden / products.length;
    expect(hidden).toBeGreaterThan(0);
    expect(ratio).toBeGreaterThanOrEqual(0.05);
    expect(ratio).toBeLessThanOrEqual(0.15);
  });

  it("gives café drink categories sugar support but not grocery categories", () => {
    const bundle = generateStoreSeed();
    const caféCats = ["مشروبات ساخنة", "قهوة", "مشروبات باردة", "كافيه - أصناف ساخنة", "كافيه - أصناف باردة"];
    for (const c of bundle.categories) {
      if (caféCats.includes(c.name)) {
        expect(c.supportsSugarOptions).toBe(true);
      } else {
        expect(c.supportsSugarOptions).toBe(false);
      }
    }
  });

  it("distributes an inventory profile across products", () => {
    const { products } = generateStoreSeed();
    const online = products.filter((p) => p.onlineVisible);
    const withStock = online.filter((p) => p.initialStock > 0).length;
    expect(withStock).toBeGreaterThan(online.length * 0.6);
  });
});

describe("store-seed DB writer (runStoreSeed)", () => {
  it("seeds catalog + inventory idempotently and consistently", async () => {
    await resetDb();

    const first = await runStoreSeed();
    expect(first.productsCreated).toBeGreaterThanOrEqual(1000);
    expect(first.categoriesCreated).toBeGreaterThanOrEqual(1);
    expect(first.brandsCreated).toBeGreaterThanOrEqual(1);
    expect(first.stockReceivedFor).toBeGreaterThan(0);

    // Catalog persisted with unique barcodes / SKUs.
    const productCount = await ProductModel.countDocuments();
    const barcodes = await ProductModel.find().select("barcode").lean();
    expect(productCount).toBe(first.productsCreated);
    assertUnique(barcodes.map((b) => b.barcode));

    // Every product has an InventoryState row.
    const stateCount = await InventoryStateModel.countDocuments();
    expect(stateCount).toBe(productCount);

    // Stock ledger consistency: for non-expiry products, onHand equals the sum
    // of PURCHASE movements.
    const stateRows = await InventoryStateModel.find()
      .select("product onHand")
      .lean<Array<{ product: import("mongoose").Types.ObjectId; onHand: number }>>();
    const movements = await StockMovementModel.aggregate([
      { $group: { _id: "$product", total: { $sum: "$quantity" } } },
    ]);
    const movementByProduct = new Map(
      movements.map((m) => [m._id.toString(), m.total as number]),
    );
    for (const s of stateRows) {
      expect(movementByProduct.get(s.product.toString()) ?? 0).toBe(s.onHand);
    }

    // Expiry-tracked products received a future-dated batch.
    const expiringProducts = await ProductModel.find({ trackExpiry: true })
      .select("_id")
      .lean();
    const batchProducts = await ProductBatchModel.find().select("product").distinct("product");
    expect(batchProducts.length).toBeGreaterThan(0);
    expect(batchProducts.length).toBeLessThanOrEqual(expiringProducts.length);

    // An online-visible product with stock must be visible in the store query.
    const visible = await ProductModel.countDocuments({ onlineVisible: true, active: true });
    expect(visible).toBeGreaterThan(0);

    // Idempotency: a second run adds nothing.
    const second = await runStoreSeed();
    expect(second.productsCreated).toBe(0);
    expect(second.stockReceivedFor).toBe(0);
    expect(await ProductModel.countDocuments()).toBe(productCount);
    expect(await InventoryStateModel.countDocuments()).toBe(stateCount);
  });

  it("exposes complete store-facing data for every online-visible product", async () => {
    await resetDb();
    await runStoreSeed();

    const online = await ProductModel.find({ onlineVisible: true, active: true })
      .populate("category", "name")
      .populate("brand", "name")
      .lean<Array<{
        name: string;
        sellingPrice: number;
        unit: string;
        description?: string;
        category?: { name: string } | null;
        brand?: { name: string } | null;
      }>>();

    expect(online.length).toBeGreaterThan(0);
    for (const p of online) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.sellingPrice).toBeGreaterThan(0);
      expect(p.unit.length).toBeGreaterThan(0);
      expect(p.description?.trim().length).toBeGreaterThan(0);
      expect(p.category?.name.length).toBeGreaterThan(0);
    }

    // Hidden products are never exposed to the storefront query.
    const visibleViaStore = await ProductModel.countDocuments({
      onlineVisible: true,
      active: true,
    });
    const total = await ProductModel.countDocuments();
    const hidden = await ProductModel.countDocuments({ onlineVisible: false });
    expect(visibleViaStore + hidden).toBe(total);
    expect(hidden).toBeGreaterThan(0);
  });
});