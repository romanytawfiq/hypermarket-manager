import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    globals: true,
    testTimeout: 15000,
    env: {
      // Defaults so the validated env module can be imported in unit tests
      // without requiring a live database. Service/integration tests that
      // actually connect override this with an available URI.
      MONGODB_URI: "mongodb://127.0.0.1:27017/nexa-retail-test",
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
