/**
 * One-off seed runner.
 *
 * Usage:  npm run seed
 * Requires a reachable MongoDB (MONGODB_URI) and, in development, an optional
 * SEED_OWNER_PASSWORD to bootstrap a development Owner.
 *
 * .env.local is loaded if present so local seeding works out of the box.
 */

import { existsSync } from "node:fs";
import mongoose from "mongoose";

if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

async function main() {
  const { runSeed } = await import("../src/lib/seed");

  const result = await runSeed();
  console.log(
    `Seed complete: ${result.permissionsCreated} permission(s) created, ` +
      `${result.rolesUpserted} role(s) upserted, ` +
      `devOwnerEnsured=${result.devOwnerEnsured}`,
  );
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("[seed] failed:", error);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
