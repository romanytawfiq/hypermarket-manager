import { z } from "zod";

/**
 * Validated environment configuration.
 *
 * The environment is the source of truth for application configuration.
 * Validating it at module load prevents misconfiguration from silently
 * failing at runtime (e.g., an unset database URI).
 *
 * Technical identifiers are kept in English; the values are injected through
 * Next.js environment variables.
 */

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  /**
   * MongoDB connection string.
   *
   * In development we connect to a local MongoDB. In production a replica set
   * is required to support multi-document ACID transactions for financial
   * integrity (see docs/architecture.md §9).
   */
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  /**
   * Secret used to sign authentication sessions. Introduced in the
   * authentication phase; validated here so configuration is centralized.
   */
  AUTH_SECRET: z.string().default("development-only-insecure-secret"),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI,
  AUTH_SECRET: process.env.AUTH_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `- ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid environment configuration.\n${issues}\n\n` +
      `Create a .env.local file from .env.example and set the required values.`,
  );
}

export const env = parsed.data;

/** True when running the automated test suite. */
export const isTest = env.NODE_ENV === "test";

/** True when running in a production build. */
export const isProduction = env.NODE_ENV === "production";
