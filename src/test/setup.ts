/**
 * Vitest global setup.
 *
 * Starts an in-memory MongoDB (mongodb-memory-server) and points MONGODB_URI at
 * it BEFORE any test file imports `@/lib/env` (which caches the URI at module
 * load). This keeps service/integration tests fully isolated from a live
 * MongoDB instance.
 */
import { MongoMemoryServer } from "mongodb-memory-server";

const mongod = await MongoMemoryServer.create();

process.env.MONGODB_URI = mongod.getUri("nexa-retail-test");

export { mongod };
