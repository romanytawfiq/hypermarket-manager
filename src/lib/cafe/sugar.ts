/**
 * Café sugar-level constants (Phase 7.1).
 *
 * Structured, English identifiers stored in the database and exposed in API
 * contracts. The Arabic label is presentation-only and is centralized here so
 * models, validations, the order builder, and the Barista KDS stay consistent.
 *
 * Mapping (Egyptian café usage):
 *
 *   سادة          → PLAIN        (no sugar)
 *   ريحة          → LIGHT        (very light sugar)
 *   مزبوط         → MEDIUM       (balanced)
 *   مانو          → STANDARD     (standard)
 *   زيادة         → EXTRA
 *   فوق الزيادة   → EXTRA_EXTRA
 *   كراميل        → CARAMEL
 *
 * Sugar belongs to the individual cup. Two cups of the same product with
 * different sugar levels are always represented as separate order lines and
 * are never merged.
 */

export const CAFE_SUGAR_LEVELS = [
  "PLAIN",
  "LIGHT",
  "MEDIUM",
  "STANDARD",
  "EXTRA",
  "EXTRA_EXTRA",
  "CARAMEL",
] as const;

export type CafeSugarLevel = (typeof CAFE_SUGAR_LEVELS)[number];

/** Arabic label shown to users for each sugar level. */
export const CAFE_SUGAR_LABELS: Record<CafeSugarLevel, string> = {
  PLAIN: "سادة",
  LIGHT: "ريحة",
  MEDIUM: "مزبوط",
  STANDARD: "مانو",
  EXTRA: "زيادة",
  EXTRA_EXTRA: "فوق الزيادة",
  CARAMEL: "كراميل",
};

/** Default sugar preselected when a sugar-capable product is added to a café order. */
export const DEFAULT_CAFE_SUGAR: CafeSugarLevel = "STANDARD";

/** Returns the Arabic label for a sugar level, with a safe empty fallback. */
export function sugarLabel(level: string | null | undefined): string {
  if (!level) return "";
  return CAFE_SUGAR_LABELS[level as CafeSugarLevel] ?? "";
}