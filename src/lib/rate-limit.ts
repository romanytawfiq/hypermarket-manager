import { headers } from "next/headers";

/**
 * Minimal in-memory sliding-window rate limiter (Phase 9).
 *
 * The public checkout / order-creation Server Action is a write path with no
 * authentication, so it must be throttled to prevent scripted flooding. This is
 * a dependency-free, process-local guard — appropriate for a single-instance
 * deployment and as a first line of defense. A production deployment behind
 * multiple instances/edge should replace this with the platform's rate limiter
 * (reverse proxy, CDN, or a shared store) keyed on client IP.
 */

interface Bucket {
  hits: number[];
  windowStart: number;
}

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 20; // orders / minute per client
const store = new Map<string, Bucket>();

async function clientKey(): Promise<string> {
  const h = await headers();
  // Prefer the right-most untrusted-free hop from the proxy chain; fall back to
  // a shared key so the guard still applies when no IP is available.
  const fwd = (h.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean);
  return (fwd[0] ?? "unknown-ip").slice(0, 64);
}

/**
 * Returns true when the caller has exceeded the allowed request rate for the
 * current window. Call this at the top of the guarded Server Action.
 */
export async function isRateLimited(): Promise<boolean> {
  const key = await clientKey();
  const now = Date.now();
  const bucket = store.get(key) ?? { hits: [], windowStart: now };

  if (now - bucket.windowStart >= WINDOW_MS) {
    bucket.windowStart = now;
    bucket.hits = [];
  }
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);
  bucket.hits.push(now);

  store.set(key, bucket);

  // Opportunistically evict rooms that have gone idle to cap memory growth.
  if (store.size > 10_000) {
    for (const [k, b] of store) {
      if (now - b.windowStart > WINDOW_MS * 2) store.delete(k);
    }
  }

  return bucket.hits.length > MAX_REQUESTS;
}
