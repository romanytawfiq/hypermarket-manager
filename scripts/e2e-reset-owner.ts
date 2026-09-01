/**
 * E2E bootstrap helper: connects to the memory DB and forces a known password
 * for the development Owner so browser/E2E tests have stable credentials
 * regardless of any `.env.local` values.
 *
 * Usage: MONGODB_URI=... E2E_OWNER_PASSWORD=... npx tsx scripts/e2e-reset-owner.ts
 */
import mongoose from "mongoose";
import { hashPassword } from "../src/lib/auth/password";
import { UserModel } from "../src/models/user";

async function main() {
  const password = process.env.E2E_OWNER_PASSWORD ?? "AdminPass@123";
  await mongoose.connect(process.env.MONGODB_URI!);
  await UserModel.updateOne(
    { username: "admin", isOwner: true },
    { $set: { passwordHash: await hashPassword(password) } },
  );
  const count = await UserModel.countDocuments({ username: "admin" });
  console.log(`[e2e-reset-owner] ensured admin owner (matched=${count})`);
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error("[e2e-reset-owner] failed:", error);
  process.exitCode = 1;
});
