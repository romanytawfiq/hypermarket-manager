/**
 * Development store-catalogue seeder.
 *
 * Usage:  npm run seed:store
 * Requires a reachable MongoDB (MONGODB_URI). .env.local is loaded if present.
 *
 * Populates (idempotently) the categories/brands/products + audit-checked
 * inventory needed for the public online storefront to show real content in
 * development. See src/lib/store-seed/run.ts for the safety guarantees.
 */

import { existsSync } from "node:fs";
import mongoose from "mongoose";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const { runStoreSeed } = await import("../src/lib/store-seed/run");
  const result = await runStoreSeed();
  console.log(
    `[seed:store] done. categoriesCreated=${result.categoriesCreated} ` +
      `brandsCreated=${result.brandsCreated} productsCreated=${result.productsCreated} ` +
      `productsSeen=${result.productsSeen} stockReceivedFor=${result.stockReceivedFor}`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[seed:store] failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});