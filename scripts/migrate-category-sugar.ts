/**
 * One-off migration: move café sugar capability from product-level to
 * category-level configuration (Phase 7.1 → category-based).
 *
 * Background:
 *  - Previously each Product had its own `supportsSugarOptions` boolean.
 *  - Going forward, a product derives its sugar capability from its Category's
 *    `supportsSugarOptions` (single source of truth).
 *
 * What this migration does (safe & idempotent):
 *  1. Finds every product where `supportsSugarOptions === true`.
 *  2. Sets `supportsSugarOptions = true` on each of those products' categories.
 *  3. Leaves the legacy product-level field in place (not deleted) so existing
 *     historical documents persist unchanged.
 *
 * It never sets a category to false, so re-running is harmless.
 *
 * Usage:  npm run migrate:category-sugar
 * Requires a reachable MongoDB (MONGODB_URI). .env.local is loaded if present.
 */

import { existsSync } from "node:fs";
import mongoose from "mongoose";
import { dbConnect } from "../src/lib/db";
import { ProductModel } from "../src/models/product";
import { CategoryModel } from "../src/models/category";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  await dbConnect();

  const productsWithSugar = await ProductModel.find({
    supportsSugarOptions: true,
  })
    .select("_id category supportsSugarOptions")
    .lean<Array<{ _id: mongoose.Types.ObjectId; category?: mongoose.Types.ObjectId | null }>>();

  const categoryIds = [
    ...new Set(
      productsWithSugar
        .map((p) => p.category)
        .filter((c): c is mongoose.Types.ObjectId => Boolean(c)),
    ),
  ];

  if (categoryIds.length > 0) {
    const update = await CategoryModel.updateMany(
      { _id: { $in: categoryIds }, supportsSugarOptions: { $ne: true } },
      { $set: { supportsSugarOptions: true } },
    );
    console.log(
      `[migrate:category-sugar] ${productsWithSugar.length} product(s) had sugar capability. ` +
        `Enabled sugar on ${update.modifiedCount} category(ies) (${categoryIds.length} distinct).`,
    );
  } else {
    console.log("[migrate:category-sugar] No products with sugar capability found; nothing to do.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[migrate:category-sugar] failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});