import { randomBytes, createHash } from "node:crypto";

/**
 * Opaque session token generation.
 *
 * The raw token is sent to the browser in an HTTP-only cookie. Only its
 * SHA-256 hash is persisted, so a database leak does not reveal usable tokens.
 */

const TOKEN_BYTES = 32;

/** Generates a cryptographically random opaque session token. */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** Returns the SHA-256 hex hash of a session token (what the DB stores). */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
