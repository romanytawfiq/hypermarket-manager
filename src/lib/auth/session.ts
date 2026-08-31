import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { env, isProduction } from "@/lib/env";

/**
 * Session cookie configuration.
 *
 * - HTTP-only: the token is never readable from client-side JavaScript.
 * - Secure: set in production (HTTPS). Development uses plain HTTP so Secure
 *   is omitted there.
 * - SameSite=Lax: blocks cross-site CSRF POSTs while remaining usable for
 *   same-origin staff workflows.
 * - `__Host-` prefix in production: enforces Secure + Path=/ + no Domain as a
 *   hardening measure (only valid over HTTPS).
 */

export const SESSION_TTL_MS = env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

export function sessionCookieName(): string {
  return isProduction ? "__Host-nexa_session" : "nexa_session";
}

export function sessionCookieOptions(): Partial<ResponseCookie> {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: env.SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
