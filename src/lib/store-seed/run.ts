/**
 * Development store-seed DB writer.
 *
 * Persists the deterministic catalogue from `generateStoreSeed()` into MongoDB:
 *  1. Upserts categories (by unique name) and brands (by unique name), leaving
 *     existing documents untouched.
 *  2. Bulk-inserts products that are not already present (identified by their
 *     unique, deterministic barcode) — idempotent, non-destructive.
 *  3. Creates an initial zero InventoryState for every new product.
 *  4. Records received stock preserving the inventory service's invariants: it
 *     sets `InventoryState.onHand`, appends an auditable `PURCHASE`
 *     `StockMovement`, and (for expiry-tracked products) creates a future-dated
 *     `ProductBatch`. This is equivalent to what `receivePurchaseStock`
 *     produces, but uses bulk writes so a 1000+ product catalogue seeds quickly
 *     and works on standalone local MongoDB (no multi-document transactions).
 *
 * Dev/test data only: guarded against PRODUCTION, and clearly labeled.
 */

import mongoose from "mongoose";
import { dbConnect } from "@/lib/db";
import { isProduction } from "@/lib/env";
import { generateStoreSeed } from "@/lib/store-seed/generator";
import { CategoryModel } from "@/models/category";
import { BrandModel } from "@/models/brand";
import { ProductModel } from "@/models/product";
import { InventoryStateModel } from "@/models/inventory-state";
import { StockMovementModel } from "@/models/stock-movement";
import { ProductBatchModel } from "@/models/product-batch";
import type { AuthUser } from "@/services/auth.service";

const SEED_SYSTEM_ACTOR: AuthUser = {
  id: "store-seed-system",
  username: "store-seed-system",
  name: "نظام تجهيز بيانات المتجر",
  active: true,
  roleId: "",
  role: "MANAGER",
  isOwner: false,
  permissions: new Set<string>(["purchases.receive"]),
};

export interface StoreSeedResult {
  categoriesCreated: number;
  brandsCreated: number;
  productsCreated: number;
  productsSeen: number;
  stockReceivedFor: number;
}

/** Adds future expiry dates for expiry-tracked products (deterministic). */
function expiryFor(seedIndex: number): string {
  const months = 6 + (seedIndex % 10);
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

/** Upserts a category by its unique name. Returns true when newly created. */
async function ensureCategory(name: string, supportsSugarOptions: boolean): Promise<boolean> {
  const result = await CategoryModel.updateOne(
    { name },
    {
      $setOnInsert: { name, active: true, supportsSugarOptions },
    },
    { upsert: true },
  );
  return result.upsertedCount > 0;
}

/** Upserts a brand by its unique name. Returns true when newly created. */
async function ensureBrand(name: string): Promise<boolean> {
  const result = await BrandModel.updateOne(
    { name },
    { $setOnInsert: { name, active: true } },
    { upsert: true },
  );
  return result.upsertedCount > 0;
}

/**
 * Persists the store-seed catalogue. Idempotent: can be run repeatedly and only
 * ever adds missing records — existing products (matched by barcode) are never
 * mutated, never duplicated, and nothing is deleted.
 */
export async function runStoreSeed(): Promise<StoreSeedResult> {
  if (isProduction) {
    throw new Error(
      `runStoreSeed refuses to run in production. Store data seed is a development facility.`,
    );
  }

  await dbConnect();

  const bundle = generateStoreSeed();

  let categoriesCreated = 0;
  for (const c of bundle.categories) {
    if (await ensureCategory(c.name, c.supportsSugarOptions)) categoriesCreated += 1;
  }

  let brandsCreated = 0;
  for (const b of bundle.brands) {
    if (await ensureBrand(b.name)) brandsCreated += 1;
  }

  // Resolve brand ObjectIds for the products we will insert.
  const brandDocs = await BrandModel.find({ name: { $in: bundle.brands.map((b) => b.name) } })
    .select("_id name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  const brandIdMap = new Map(brandDocs.map((b) => [b.name, b._id]));
  const categoryDocs = await CategoryModel.find({
    name: { $in: bundle.categories.map((c) => c.name) },
  })
    .select("_id name")
    .lean<Array<{ _id: mongoose.Types.ObjectId; name: string }>>();
  const categoryIdMap = new Map(categoryDocs.map((c) => [c.name, c._id]));

  // Look for barcodes that already exist so re-runs only add missing products.
  const existing = await ProductModel.find({
    barcode: { $in: bundle.products.map((p) => p.barcode) },
  })
    .select("barcode")
    .lean<Array<{ barcode?: string }>>();
  const existingBarcodes = new Set(existing.map((e) => e.barcode).filter(Boolean));

  const docs = bundle.products
    .filter((p) => !existingBarcodes.has(p.barcode))
    .map((p) => {
      const category = categoryIdMap.get(p.categoryName);
      if (!category) {
        throw new Error(`missing category id for: ${p.categoryName}`);
      }
      const brand = brandIdMap.get(p.brandName);
      return {
        name: p.name,
        barcode: p.barcode,
        sku: p.sku,
        category: category._id,
        brand: brand?._id ?? null,
        unit: p.unit,
        purchaseCost: p.purchaseCost,
        sellingPrice: p.sellingPrice,
        minimumStock: p.minimumStock,
        trackExpiry: p.trackExpiry,
        onlineVisible: !p.onlineVisible ? false : p.onlineVisible,
        description: p.description,
        active: true,
      };
    });

  const toInsert = docs;
  if (toInsert.length > 0) {
    await ProductModel.insertMany(toInsert, { ordered: false });
  }

  // Bulk-create the initial zero-state inventory rows for newly added products.
  const insertedProducts = await ProductModel.find({
    barcode: { $in: toInsert.map((p) => p.barcode as string) },
  })
    .select("_id barcode trackExpiry")
    .lean<Array<{ _id: mongoose.Types.ObjectId; barcode: string; trackExpiry: boolean }>>();
  const stateBulk = [];
  for (const p of insertedProducts) {
    stateBulk.push({ product: p._id, onHand: 0, nonSellable: 0, version: 1 });
  }
  if (stateBulk.length > 0) {
    await InventoryStateModel.insertMany(stateBulk, { ordered: false });
  }

  // Everything below works across both the products just inserted AND any that
  // already existed, so re-runs are resumable after a partial failure.
  const allProductDocs = await ProductModel.find({
    barcode: { $in: bundle.products.map((p) => p.barcode) },
  })
    .select("_id barcode name trackExpiry")
    .lean<Array<{
      _id: mongoose.Types.ObjectId;
      barcode: string;
      name: string;
      trackExpiry: boolean;
    }>>();
  const barcodeToDoc = new Map(allProductDocs.map((d) => [d.barcode, d]));
  const idToMeta = new Map(
    allProductDocs.map((d) => [d._id.toString(), { name: d.name, trackExpiry: d.trackExpiry }]),
  );

  // Skip products whose stock was already received (InventoryState.onHand > 0),
  // so a fully-seeded DB stays idempotent and a partial run resumes cleanly.
  const alreadyStocked = await InventoryStateModel.find({ onHand: { $gt: 0 } })
    .select("product")
    .distinct("product")
    .then((ids) => new Set(ids.map((id) => id.toString())));

  const stockItems: Array<{ productId: string; quantity: number; trackExpiry: boolean; expiryDate?: string }> = [];
  for (const p of bundle.products) {
    if (p.initialStock <= 0) continue;
    const doc = barcodeToDoc.get(p.barcode);
    if (!doc) continue; // product did not get inserted (should not happen)
    if (alreadyStocked.has(doc._id.toString())) continue; // already received
    stockItems.push({
      productId: doc._id.toString(),
      quantity: p.initialStock,
      trackExpiry: p.trackExpiry,
      ...(p.trackExpiry ? { expiryDate: expiryFor(Number(p.barcode.slice(-2))) } : {}),
    });
  }

  let stockReceivedFor = 0;
  if (stockItems.length > 0) {
    // Seed inventory through the SAME invariant the inventory service enforces
    // for a purchase receipt: `InventoryState.onHand` equals the received
    // quantity, an append-only `PURCHASE` `StockMovement` records the receipt,
    // and expiry-tracked products get a future-dated `ProductBatch`. This keeps
    // Product stock === InventoryState.onHand and the ledger auditable, while
    // using bulk writes so a 1000+ product catalogue seeds quickly and works on
    // standalone local MongoDB (no multi-document transactions required).
    const now = new Date();
    const referenceId = `store-seed-${now.getTime()}`;

    const stateOps = stockItems.map((it) => ({
      updateOne: {
        filter: { product: it.productId },
        update: { $set: { onHand: it.quantity, version: 2 } },
        upsert: true,
      },
    }));
    await InventoryStateModel.bulkWrite(stateOps, { ordered: false });

    const movements = stockItems.map((it) => ({
      product: it.productId,
      type: "PURCHASE" as const,
      quantity: it.quantity,
      reason: `تجهيز مخزون المتجر (بيانات تطوير): ${idToMeta.get(it.productId)?.name ?? ""} (${it.quantity})`,
      referenceType: "PURCHASE",
      referenceId,
      actorId: SEED_SYSTEM_ACTOR.id,
      actorUsername: SEED_SYSTEM_ACTOR.username,
    }));
    await StockMovementModel.insertMany(movements, { ordered: false });

    const batches = stockItems
      .filter((it) => it.trackExpiry && it.expiryDate)
      .map((it) => ({
        product: it.productId,
        batchCode: `LOT-${it.productId.slice(-6)}`,
        quantity: it.quantity,
        expiryDate: new Date(it.expiryDate as string),
        sourceReference: { type: "PURCHASE", id: referenceId },
      }));
    if (batches.length > 0) {
      await ProductBatchModel.insertMany(batches, { ordered: false });
    }

    stockReceivedFor = stockItems.length;
  }

  return {
    categoriesCreated,
    brandsCreated,
    productsCreated: toInsert.length,
    productsSeen: bundle.products.length,
    stockReceivedFor,
  };
}