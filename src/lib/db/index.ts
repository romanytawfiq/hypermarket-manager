import mongoose from "mongoose";
import { env } from "@/lib/env";

/**
 * MongoDB connection management.
 *
 * Next.js development hot-reloads modules, which would otherwise create a new
 * connection per reload and exhaust the connection pool. We therefore cache the
 * connection promise on the global object in development and reuse it.
 */

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

// `globalThis` is not preserved across reloads during development, so we attach
// the cache to a global symbol to guarantee a single shared connection pool.
const globalWithMongoose = globalThis as typeof globalThis & {
  __nexaMongooseCache?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose.__nexaMongooseCache ?? {
  conn: null,
  promise: null,
};

globalWithMongoose.__nexaMongooseCache = cached;

/**
 * Establishes (or reuses) the MongoDB connection and returns the mongoose
 * instance. Configures model indexes automatically when `autoBuild` is true.
 */
export async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(env.MONGODB_URI);
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (error) {
    cached.promise = null;
    cached.conn = null;
    throw new Error(
      `Failed to connect to MongoDB. Check that MONGODB_URI is correct and the database is reachable.`,
      { cause: error },
    );
  }
}

/** True when mongoose currently holds an open connection. */
export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Runs `work` inside a MongoDB transaction.
 *
 * Multi-document ACID transactions require a replica set. When an operation
 * spans multiple documents (e.g., create sale + update stock + append ledger),
 * wrap it in `withTransaction` so all changes commit or roll back together.
 */
export async function withTransaction<T>(
  work: (session: mongoose.ClientSession) => Promise<T>,
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
