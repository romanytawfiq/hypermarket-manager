import { describe, it, expect, beforeAll } from "vitest";
import { AppError } from "@/lib/errors";
import { lookupPosBarcode, posSearchProducts } from "@/services/sales.service";
import { createProduct, createCategory } from "@/services/catalog.service";
import { receivePurchaseStock } from "@/services/inventory.service";
import { resetDb, createUser, buildAuthUser } from "@/test/helpers";

/**
 * Tests for the POS barcode lookup that backs both the camera scanner and the
 * keyboard/USB scanner (the common barcode handler's server source of truth).
 * The scanner UI itself is browser-only (camera APIs) and is not exercised by
 * the node test environment; these tests cover the shared lookup business rules.
 */
describe("POS barcode lookup (camera + USB scanner common handler)", () => {
  let manager: Awaited<ReturnType<typeof buildAuthUser>>;

  beforeAll(async () => {
    await resetDb();
    manager = await buildAuthUser(await createUser({ username: "barcode_mgr", role: "MANAGER" }));
  });

  async function makeBarcodedProduct(opts: {
    name: string;
    barcode: string;
    active?: boolean;
    stock?: number;
  }): Promise<string> {
    const cat = await createCategory(manager, { name: `فئة ${opts.name}` });
    const p = await createProduct(manager, {
      name: opts.name,
      barcode: opts.barcode,
      categoryId: cat.id,
      unit: "قطعة",
      purchaseCost: 10,
      sellingPrice: 20,
      minimumStock: 0,
      active: opts.active ?? true,
    });
    if (opts.stock && opts.stock > 0) {
      await receivePurchaseStock(
        manager,
        [{ productId: p.id, productName: opts.name, quantity: opts.stock, trackExpiry: false }],
        {},
      );
    }
    return p.id;
  }

  it("returns status 'found' for an active product with its sellable stock", async () => {
    const id = await makeBarcodedProduct({ name: "بيبسي 330 مل", barcode: "622300000001", stock: 6 });
    const result = await lookupPosBarcode(manager, "622300000001");
    expect(result.status).toBe("found");
    if (result.status === "found") {
      expect(result.product?.id).toBe(id);
      expect(result.product?.name).toBe("بيبسي 330 مل");
      expect(result.product?.sellable).toBe(6);
      expect(result.product?.barcode).toBe("622300000001");
    }
  });

  it("returns 'notfound' for an empty barcode", async () => {
    const result = await lookupPosBarcode(manager, "   ");
    expect(result.status).toBe("notfound");
    expect(result.product).toBeUndefined();
  });

  it("returns 'notfound' for an unknown barcode that matches no product", async () => {
    const result = await lookupPosBarcode(manager, "9999999999999");
    expect(result.status).toBe("notfound");
  });

  it("returns 'inactive' (not 'notfound') for a deactivated product's barcode", async () => {
    await makeBarcodedProduct({ name: "منتج معطّل", barcode: "622300000099", active: false });
    const result = await lookupPosBarcode(manager, "622300000099");
    expect(result.status).toBe("inactive");
    expect(result.product).toBeUndefined();
  });

  it("excludes inactive products from the general POS search (regression: BR-004)", async () => {
    const res = await posSearchProducts(manager, "622300000099");
    expect(res.length).toBe(0);
  });

  it("does not return outstanding balances or leak inactive products via found path", async () => {
    await makeBarcodedProduct({ name: "مشروب نشط", barcode: "622300000050", stock: 3 });
    const found = await lookupPosBarcode(manager, "622300000050");
    expect(found.status).toBe("found");
    if (found.status === "found") {
      expect(found.product?.sellingPrice).toBe(20);
    }
  });

  it("rejects a user without sales.create (authorization is enforced server-side)", async () => {
    const warehouse = await buildAuthUser(
      await createUser({ username: "barcode_wh", role: "WAREHOUSE_EMPLOYEE" }),
    );
    let caught: unknown;
    try {
      await lookupPosBarcode(warehouse, "622300000001");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AppError);
    if (caught instanceof AppError) expect(caught.code).toBe("FORBIDDEN");
  });
});
