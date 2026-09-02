import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Per-worker setup: each Vitest worker (one per test file, isolated) starts
    // its own in-memory MongoDB replica set so parallel workers never share a
    // mutable database (`resetDb()` drops it). The setup registers a teardown
    // that STOPS the instance when the worker finishes, so its
    // `%TEMP%\mongo-mem-*` directory is deleted. (Previously the instance was
    // never stopped — every run leaked ~23 dirs / ~4.8 GB that grew `%TEMP%`
    // linearly. teardown fixes that root lifecycle.)
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    testTimeout: 15000,
    env: {
      // NOTE: MONGODB_URI intentionally NOT set here — `setup.ts` overrides it
      // per worker before any test module imports `@/lib/env` (which caches it
      // at load). Setting it here would be overridden anyway and only add
      // confusion.
      NODE_ENV: "test",
      // Enable the ONLINE payment path in tests. The gateway HTTP call is stubbed
      // per-test so no real network request is made (see online-store.test.ts).
      KASHIER_MODE: "test",
      KASHIER_API_KEY: "test-api-key",
      KASHIER_SECRET_KEY: "test-secret-key",
      KASHIER_MERCHANT_ID: "MID-test-000",
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
