import { hash, compare } from "bcryptjs";

/**
 * Password hashing.
 *
 * Uses bcryptjs (pure-JS bcrypt) — a strong, production-appropriate password
 * hash with per-password salts (docs/architecture.md §11). Plaintext passwords
 * and hashes are never logged.
 *
 * Cost factor 12 provides a good strength/CPU balance for an internal app.
 */

const BCRYPT_ROUNDS = 12;

/** Hashes a plaintext password for storage. */
export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, BCRYPT_ROUNDS);
}

/** Verifies a plaintext password against a stored bcrypt hash. */
export function verifyPassword(plaintext: string, hashed: string): Promise<boolean> {
  return compare(plaintext, hashed);
}
