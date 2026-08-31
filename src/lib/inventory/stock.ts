/**
 * Reusable inventory stock rules.
 *
 * These pure functions centralize the low-stock, out-of-stock, replenishment,
 * and expiry semantics so they are not duplicated across services or UI.
 *
 * Low-stock rule (BR-026): a product is low when `sellable <= minimum`.
 * Out-of-stock rule (BR-027): a product is out of stock when it has no
 * available sellable quantity (`sellable <= 0`).
 */

/** Number of days before expiry that a batch is flagged "expiring soon". */
export const EXPIRING_SOON_DAYS = 30;

/** A product is low stock when its sellable quantity is at/below the minimum. */
export function isLowStock(sellable: number, minimumStock: number): boolean {
  return sellable <= minimumStock;
}

/** A product is out of stock when it has no available sellable quantity. */
export function isOutOfStock(sellable: number): boolean {
  return sellable <= 0;
}

/**
 * Suggested replenishment quantity.
 *
 * Simple, documented formula: raise sellable stock back up to the minimum
 * threshold (never negative). Advanced velocity/forecasting is intentionally
 * out of scope for Phase 2.
 */
export function suggestedReplenishment(
  sellable: number,
  minimumStock: number,
): number {
  return Math.max(0, minimumStock - sellable);
}

/** True when the given date is in the past (expired). */
export function isExpired(expiryDate: Date, now: Date = new Date()): boolean {
  return expiryDate.getTime() <= now.getTime();
}

/**
 * True when the given date is in the future but within `thresholdDays` of now
 * (approaching expiry). Does not report already-expired batches as "soon".
 */
export function isExpiringSoon(
  expiryDate: Date,
  thresholdDays: number = EXPIRING_SOON_DAYS,
  now: Date = new Date(),
): boolean {
  const diffMs = expiryDate.getTime() - now.getTime();
  return diffMs > 0 && diffMs <= thresholdDays * 24 * 60 * 60 * 1000;
}
