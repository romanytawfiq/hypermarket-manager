/**
 * Vitest global setup.
 *
 * Starts an in-memory MongoDB replica set (single node) and points MONGODB_URI
 * at it BEFORE any test file imports `@/lib/env` (which caches the URI at module
 * load). A replica set is required because inventory operations run inside
 * multi-document transactions (`withTransaction`).
 *
 * This keeps service/integration tests fully isolated from a live MongoDB.
 */
import { MongoMemoryReplSet } from "mongodb-memory-server";

const mongod = await MongoMemoryReplSet.create({
  replSet: { count: 1 },
});

await mongod.waitUntilRunning();

process.env.MONGODB_URI = mongod.getUri("nexa-retail-test");

export { mongod };
