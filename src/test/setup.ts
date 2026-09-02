/**
 * Vitest per-worker setup.
 *
 * Starts an in-memory MongoDB replica set (single node) and points MONGODB_URI
 * at it BEFORE any test file imports `@/lib/env` (which caches the URI at module
 * load). A replica set is required because inventory operations run inside
 * multi-document transactions (`withTransaction`).
 *
 * Isolation: Vitest runs each test file in its own worker, so each worker gets
 * its own isolated database — parallel workers never share a mutable database
 * (`resetDb()` drops the whole DB) and never clash.
 *
 * Lifecycle fix: the instance is registered with `afterAll` so it is STOPPED
 * (and its `%TEMP%\mongo-mem-*` data directory deleted) when the worker's tests
 * finish. Previously the instance was never stopped, so every test run leaked
 * ~23 `mongo-mem-*` directories (~4.8 GB) and `%TEMP%` grew linearly with each
 * run. Stopping here is what breaks the accumulation.
 */
import { afterAll } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mongod = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
});

await mongod.waitUntilRunning();

process.env.MONGODB_URI = mongod.getUri("nexa-retail-test");

afterAll(async () => {
  await mongod.stop();
});

export { mongod };
