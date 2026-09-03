/**
 * Shared locale-aware presentation formatting (Phase 8).
 *
 * Centralizes money and date/time formatting so receipt documents and their
 * previews stay visually consistent. Arabic-first: `ar-EG` numerals with the
 * Egyptian Pound (`ج.م`) suffix, matching the conventions already used across
 * the POS/customer/supplier screens.
 */

const CURRENCY_SUFFIX = "ج.م";

/**
 * Rounds a number to two decimal places (money-safe, uses epsilon).
 *
 * Centralized here so financial aggregations (dashboard, accounting, expenses)
 * share the exact same rounding instead of each service redefining it locally.
 */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Formats an amount as "١٢٣٫٤٥ ج.م" (ar-EG numerals, 2 max decimals). */
export function formatEgp(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ${CURRENCY_SUFFIX}`;
}

/** Formats an ISO timestamp as a date (ar-EG). Safe fallback to the raw value. */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ar-EG");
}

/** Formats an ISO timestamp as a time (ar-EG, HH:MM). Safe fallback to the raw value. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

/** Formats an ISO timestamp as date + time (ar-EG). Safe fallback to the raw value. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}