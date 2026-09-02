import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Kashier payment gateway client (online store, Phase 9.2).
 *
 * Uses the official Kashier **Payment Sessions API v3**. The server creates a
 * payment session and sends the customer to the returned hosted payment page
 * (HPP). The authoritative confirmation of a successful payment is the Kashier
 * **server webhook** — this module verifies its HMAC-SHA256 signature and never
 * trusts the merchant redirect or any client value alone (`docs/business-rules.md`:
 * no fabricated payment success).
 *
 * This module is intentionally dependency-free of mongoose/DB so it can be unit
 * tested in isolation. All functions are pure w.r.t. their inputs except the
 * network call in `createPaymentSession` (which fetches the Kashier API).
 *
 * Redirect signature (documented Kashier contract): all query-string parameters
 * EXCEPT `signature` and `mode`, in the order received, URL-encoded, joined with
 * `&`, HMAC-SHA256 with the **secret key**, base64.
 *
 * Webhook signature (documented Kashier contract): the payload's `data` object
 * declares `signatureKeys` — the ordered list of field names from `data` that
 * were signed. Each value is URL-encoded in that order and joined with `&`, then
 * HMAC-SHA256 with the **webhook signing key** and compared to
 * `data.kashierSignature` (constant-time comparison).
 */

const KASHIER_API_BASE: Record<"test" | "live", string> = {
  test: "https://test-api.kashier.io",
  live: "https://api.kashier.io",
};

export interface KashierConfig {
  mode: "test" | "live";
  apiKey: string;
  secretKey: string;
  merchantId: string;
  webhookSigningKey: string | undefined;
}

export function kashierConfig(): KashierConfig {
  return {
    mode: env.KASHIER_MODE,
    apiKey: env.KASHIER_API_KEY ?? "",
    secretKey: env.KASHIER_SECRET_KEY ?? "",
    merchantId: env.KASHIER_MERCHANT_ID ?? "",
    webhookSigningKey: env.KASHIER_WEBHOOK_SIGNING_KEY,
  };
}

/** True when every credential required to create an online payment session is set. */
export function isKashierConfigured(): boolean {
  const c = kashierConfig();
  return Boolean(c.apiKey && c.secretKey && c.merchantId);
}

function apiBase(cfg: KashierConfig): string {
  return KASHIER_API_BASE[cfg.mode];
}

export interface CreateSessionInput {
  /** Our order reference, e.g. "ON-20260101-0001". */
  orderReference: string;
  amount: number;
  currency: "EGP";
  customer: { name: string; email?: string; phone: string };
  description: string;
  /** Where Kashier redirects the browser after payment. */
  merchantRedirectUrl: string;
  /** Server-to-server notification URL (must be HTTPS outside localhost). */
  serverWebhook: string;
  /** Comma separated allowed methods, e.g. "card,wallet". */
  allowedMethods?: string;
  /** ISO 8601 absolute expiry for the session (default: now + 1h). */
  expireAt?: Date;
  /** Max payment attempts before the session is closed. */
  maxFailureAttempts?: number;
}

export interface CreatedSession {
  /** Kashier session id (payload `_id`). */
  sessionId: string;
  /** Hosted payment page URL to redirect/embed the customer. */
  sessionUrl: string;
  /** Raw `paymentParams` echoed by Kashier (for iframe embed use). */
  paymentParams: Record<string, unknown>;
  /** Raw API response payload (for logging/debug). */
  raw: unknown;
}

/** A lightweight, structurally-typed API error from the gateway. */
export class KashierGatewayError extends Error {
  readonly status: number;
  readonly payload: unknown;
  constructor(status: number, payload: unknown) {
    super(`Kashier API request failed with status ${status}`);
    this.name = "KashierGatewayError";
    this.status = status;
    this.payload = payload;
  }
}

/**
 * Creates a Kashier payment session. Server-side only — never expose
 * `apiKey`/`secretKey` to the browser.
 */
export async function createPaymentSession(
  input: CreateSessionInput,
): Promise<CreatedSession> {
  const cfg = kashierConfig();
  if (!isKashierConfigured()) {
    throw new Error("Kashier payment gateway is not configured");
  }

  const expireAt = input.expireAt ?? new Date(Date.now() + 60 * 60 * 1000);

  const body = {
    merchantId: cfg.merchantId,
    amount: Math.round(input.amount * 100) / 100,
    currency: input.currency,
    order: {
      merchantId: cfg.merchantId,
      orderReference: input.orderReference,
      amount: Math.round(input.amount * 100) / 100,
      currency: input.currency,
      description: input.description,
      totalAmount: Math.round(input.amount * 100) / 100,
    },
    customer: {
      name: input.customer.name,
      email: input.customer.email ?? "",
      phone: input.customer.phone,
    },
    paymentType: "credit",
    allowedMethods: input.allowedMethods ?? "card,wallet",
    redirectUrl: input.merchantRedirectUrl,
    serverWebhook: input.serverWebhook,
    expireAt: expireAt.toISOString(),
    maxFailureAttempts: input.maxFailureAttempts ?? 3,
  };

  const res = await fetch(`${apiBase(cfg)}/v3/payment/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: cfg.secretKey,
      "api-key": cfg.apiKey,
    },
    body: JSON.stringify(body),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new KashierGatewayError(res.status, raw);
  }

  const sessionId = typeof raw._id === "string" ? raw._id : "";
  const paymentParams = (raw.paymentParams ?? {}) as Record<string, unknown>;
  const sessionUrl =
    typeof raw.sessionUrl === "string"
      ? raw.sessionUrl
      : typeof paymentParams.sessionUrl === "string"
        ? paymentParams.sessionUrl
        : "";

  return {
    sessionId,
    sessionUrl,
    paymentParams,
    raw,
  };
}

/**
 * Constant-time string comparison (safe against length-extension/timing probes).
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * HMAC-SHA256 (base64) of `data` under `key`.
 */
function hmacSha256(key: string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("base64");
}

/**
 * Verifies the Kashier merchant redirect (browser callback) query signature.
 *
 * `entries` is the ordered list of [key, value] query parameters **as received**
 * from Kashier. The `signature` and `mode` parameters are excluded from the
 * signed string. The signature is the HMAC-SHA256 (base64) of the URL-encoded
 * `key=value` pairs joined with `&` under the **secret key**.
 */
export function verifyRedirectSignature(
  entries: Array<[string, string]>,
  signature: string,
  secretKey: string,
): boolean {
  const signed = entries
    .filter(([k]) => k !== "signature" && k !== "mode")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  if (!signed) return false;
  const expected = hmacSha256(secretKey, signed);
  return safeEqual(expected, signature);
}

/**
 * Generates the same redirect signature the gateway would produce — used by
 * tests to construct a valid redirect callback.
 */
export function signRedirect(
  entries: Array<[string, string]>,
  secretKey: string,
): string {
  const signed = entries
    .filter(([k]) => k !== "signature" && k !== "mode")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return hmacSha256(secretKey, signed);
}

/**
 * Parses a raw query string into ordered [key, value] pairs, preserving the
 * order in which the gateway emitted them (needed for redirect signature
 * verification). Empty values are retained so the signature calculation is
 * faithful to the original request.
 */
export function parseOrderedQuery(queryString: string): Array<[string, string]> {
  const clean = queryString.startsWith("?") ? queryString.slice(1) : queryString;
  if (!clean) return [];
  return clean.split("&").map((part) => {
    const eq = part.indexOf("=");
    if (eq === -1) return [decodeURIComponent(part), ""];
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    return [key, value];
  });
}

/**
 * Convenience wrapper: verifies the redirect signature from a raw query string
 * (ordered parse) under the given secret key.
 */
export function verifyRedirectQuery(
  queryString: string,
  signature: string,
  secretKey: string,
): boolean {
  return verifyRedirectSignature(parseOrderedQuery(queryString), signature, secretKey);
}

/** The raw Kashier webhook payload (shape Kotlin/JS SDKs + docs describe). */
export interface KashierWebhookPayload {
  data: {
    /** The declared ordered list of field names that were signed. */
    signatureKeys?: string[];
    kashierSignature?: string;
    signature?: string;
    merchantId?: string;
    merchantOrderId?: string;
    orderReference?: string;
    orderId?: string;
    transactionId?: string;
    amount?: number | string;
    currency?: string;
    paymentStatus?: string;
    orderStatus?: string;
    [key: string]: unknown;
  };
  event?: string;
  [key: string]: unknown;
}

/**
 * Extracts the order reference the merchant set at session creation. Kashier can
 * send it under a few field names depending on version; we prefer
 * `merchantOrderId`, then `orderReference`, then `orderId`.
 */
export function webhookOrderReference(payload: KashierWebhookPayload): string {
  const d = payload.data ?? {};
  const candidate =
    d.merchantOrderId ?? d.orderReference ?? d.orderId ?? "";
  return typeof candidate === "string" ? candidate : String(candidate);
}

/**
 * Verifies a Kashier server webhook notification using the payload's own
 * `signatureKeys` declaration:
 *
 *   data = URLENCODE(data[signatureKeys[0]]) & URLENCODE(data[signatureKeys[1]]) & …
 *   expected = HmacSHA256(webhookSigningKey, data)
 *   valid    = constantTimeCompare(expected, data.kashierSignature)
 *
 * Falls back to `data.signature` when `kashierSignature` is absent (older
 * payloads). Returns true only when the signature matches.
 */
export function verifyWebhookSignature(
  payload: KashierWebhookPayload,
  signingKey: string,
): boolean {
  if (!signingKey) return false;
  const data = payload.data ?? {};
  const keys = Array.isArray(data.signatureKeys) ? data.signatureKeys : [];
  if (keys.length === 0) return false;

  const encoded = keys
    .map((k) => {
      const v = data[k];
      return encodeURIComponent(v == null ? "" : String(v));
    })
    .join("&");

  const expected = hmacSha256(signingKey, encoded);
  const provided = data.kashierSignature ?? data.signature ?? "";
  return safeEqual(expected, String(provided));
}

/**
 * Generates a valid webhook signature for a given `signatureKeys` set — used by
 * tests to construct a legitimate webhook notification.
 */
export function signWebhook(
  data: Record<string, unknown> & { signatureKeys: string[] },
  signingKey: string,
): string {
  return hmacSha256(
    signingKey,
    data.signatureKeys
      .map((k) => encodeURIComponent(data[k] == null ? "" : String(data[k])))
      .join("&"),
  );
}

/** True when a Kashier payload represents a successful payment capture. */
export function isKashierPaid(payload: KashierWebhookPayload): boolean {
  const status = payload.data?.paymentStatus ?? payload.data?.orderStatus;
  const s = String(status ?? "").toUpperCase();
  return s === "PAID" || s === "SUCCESS" || s === "SUCCESSFUL" || s === "CAPTURED";
}
