/**
 * Local dev-server bootstrap for browser/E2E verification.
 *
 * Starts an in-memory MongoDB replica set, seeds permissions/roles and the
 * development Owner, writes the connection string + a dev session secret to a
 * temporary .env file, then spawns `next dev` pointed at it.
 *
 * Usage: node scripts/run-dev.mjs
 *       (set DEVEL_SEED_OWNER_PASSWORD to choose the Owner password)
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const mongod = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
await mongod.waitUntilRunning();
const uri = mongod.getUri("nexa-retail-e2e");

const ownerPassword = process.env.DEVEL_SEED_OWNER_PASSWORD ?? "AdminPass@123";
const envFile = [
  "NODE_ENV=development",
  `MONGODB_URI=${uri}`,
  "AUTH_SECRET=e2e-dev-only-secret",
  "SESSION_TTL_DAYS=30",
  "SEED_OWNER_USERNAME=admin",
  `SEED_OWNER_PASSWORD=${ownerPassword}`,
  "SEED_OWNER_NAME=المدير",
  "NEXT_PUBLIC_APP_URL=http://localhost:3100",
].join("\n");

writeFileSync(resolve(root, ".env.e2e"), envFile, "utf8");

// Seed permissions, roles and the development Owner against the memory server.
const seedEnv = {
  ...process.env,
  MONGODB_URI: uri,
  AUTH_SECRET: "e2e-dev-only-secret",
  SEED_OWNER_USERNAME: "admin",
  SEED_OWNER_PASSWORD: ownerPassword,
  SEED_OWNER_NAME: "المدير",
};
console.log("[run-dev] seeding...");
await new Promise((resolveSeed, rejectSeed) => {
  const seed = spawn(
    "npx",
    ["tsx", "scripts/seed.ts"],
    { cwd: root, env: seedEnv, stdio: "inherit", shell: true },
  );
  seed.on("exit", (code) => {
    if (code === 0) resolveSeed();
    else rejectSeed(new Error(`seed exited with code ${code}`));
  });
});
console.log("[run-dev] seed complete, forcing known Owner password...");
await new Promise((resolvePw, rejectPw) => {
  const pw = spawn(
    "npx",
    ["tsx", "scripts/e2e-reset-owner.ts"],
    {
      cwd: root,
      env: { ...seedEnv, MONGODB_URI: uri, E2E_OWNER_PASSWORD: ownerPassword },
      stdio: "inherit",
      shell: true,
    },
  );
  pw.on("exit", (code) => (code === 0 ? resolvePw() : rejectPw(new Error("owner password reset failed"))));
});
console.log("[run-dev] password reset complete, starting Next.js dev server...");

const child = spawn(
  "npx",
  ["next", "dev", "-p", "3100"],
  {
    cwd: root,
    env: {
      ...process.env,
      MONGODB_URI: uri,
      AUTH_SECRET: "e2e-dev-only-secret",
      NEXT_E2E_DIST: ".next-e2e",
    },
    stdio: "inherit",
    shell: true,
  },
);

const shutdown = () => {
  child.kill("SIGTERM");
  void mongod.stop();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

child.on("exit", () => {
  void mongod.stop();
});
