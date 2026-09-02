/**
 * E2E seed for the thermal-printing spec (Phase 8).
 *
 * Drops the database, re-seeds permissions/roles, creates the development
 * Owner, then seeds storefront data + an open shift so the printing E2E can
 * sell and print through the real UI flows.
 *
 * Usage: node scripts/seed-e2e-receipt.ts  (requires .env.e2e for MONGODB_URI)
 */

import { existsSync } from "node:fs";

if (existsSync(".env.e2e")) {
  process.loadEnvFile(".env.e2e");
}

async function main() {
  const mongoose = (await import("mongoose")).default;
  const { dbConnect } = await import("@/lib/db");
  const { seedPermissions, seedRoles } = await import("@/lib/seed");
  const { createUser, buildAuthUser } = await import("@/test/helpers");
  const { createCategory, createProduct } = await import("@/services/catalog.service");
  const { receivePurchaseStock } = await import("@/services/inventory.service");
  const { openShift } = await import("@/services/shift.service");

  await dbConnect();
  await mongoose.connection.dropDatabase();
  await seedPermissions();
  await seedRoles();

  const owner = await createUser({
    username: "admin",
    password: "AdminPass@123",
    role: "OWNER",
    name: "المدير",
    isOwner: true,
  });
  const actor = await buildAuthUser(owner);

  const retailCategory = await createCategory(actor, {
    name: "فئة اختبار البيع",
    supportsSugarOptions: false,
  });
  const cafeCategory = await createCategory(actor, {
    name: "فئة اختبار الكافيه",
    supportsSugarOptions: true,
  });

  const drink = await createProduct(actor, {
    name: "مشروب اختبار طباعة",
    categoryId: retailCategory.id,
    unit: "قطعة",
    purchaseCost: 8,
    sellingPrice: 20,
    minimumStock: 0,
    trackExpiry: false,
  });
  const coffee = await createProduct(actor, {
    name: "قهوة اختبار طباعة",
    categoryId: cafeCategory.id,
    unit: "كوب",
    purchaseCost: 10,
    sellingPrice: 30,
    minimumStock: 0,
    trackExpiry: false,
  });

  await receivePurchaseStock(
    actor,
    [
      { productId: drink.id, productName: drink.name, quantity: 20, trackExpiry: false },
      { productId: coffee.id, productName: coffee.name, quantity: 50, trackExpiry: false },
    ],
    {},
  );

  await openShift(actor, { openingCash: 0 });

  console.log(
    `[seed-receipt-e2e] done (owner=${owner.username}, drink=${drink.name}, coffee=${coffee.name}, shift open)`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[seed-receipt-e2e] failed:", error);
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});