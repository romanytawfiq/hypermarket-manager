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
  AUTH_SECRET: z.string().refine(
    (val) => {
      if (process.env.NODE_ENV === "production" && val === "development-only-insecure-secret") {
        return false;
      }
      return true;
    },
    { message: "AUTH_SECRET must be set to a secure value in production" },
  ).default("development-only-insecure-secret"),

  /** Lifetime of an authentication session in days. */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  /**
   * Kashier payment gateway (online store, Phase 9.2).
   *
   * All credentials are OPTIONAL so the merchant can ship with COD-only
   * checkout and enable electronic payment later by supplying the keys +
   * merchant id. Online payment is only offered when every one of
   * KASHIER_API_KEY / KASHIER_SECRET_KEY / KASHIER_MERCHANT_ID is set.
   *
   * KASHIER_MODE selects the API base URL: "test" → https://test-api.kashier.io,
   * "live" → https://api.kashier.io.
   *
   * KASHIER_WEBHOOK_SIGNING_KEY is the key Kashier uses to sign webhook
   * notifications (configured in the Kashier dashboard Webhook settings). It is
   * often distinct from the payment API key; the server verifies every webhook
   * against it.
   */
  KASHIER_MODE: z.enum(["test", "live"]).default("test"),
  KASHIER_API_KEY: z.string().optional(),
  KASHIER_SECRET_KEY: z.string().optional(),
  KASHIER_MERCHANT_ID: z.string().optional(),
  KASHIER_WEBHOOK_SIGNING_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  MONGODB_URI: process.env.MONGODB_URI,
  AUTH_SECRET: process.env.AUTH_SECRET,
  SESSION_TTL_DAYS: process.env.SESSION_TTL_DAYS,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  KASHIER_MODE: process.env.KASHIER_MODE,
  KASHIER_API_KEY: process.env.KASHIER_API_KEY,
  KASHIER_SECRET_KEY: process.env.KASHIER_SECRET_KEY,
  KASHIER_MERCHANT_ID: process.env.KASHIER_MERCHANT_ID,
  KASHIER_WEBHOOK_SIGNING_KEY: process.env.KASHIER_WEBHOOK_SIGNING_KEY,
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
