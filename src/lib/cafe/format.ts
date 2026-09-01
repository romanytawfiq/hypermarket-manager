import type { CafeOrderStatus } from "@/models/cafe-order";

/**
 * Café domain presentational helpers (Phase 7).
 * Keeps status labels/colors/formatting in one place for the cashier screen and
 * the Barista KDS so the visual language stays consistent.
 */

export const CAFE_STATUS_LABELS: Record<CafeOrderStatus, string> = {
  NEW: "جديد",
  PREPARING: "قيد التحضير",
  READY: "جاهز",
  COMPLETED: "مكتمل",
  CANCELLED: "ملغى",
};

/** Status badge tone (Tailwind classes). Colour is never the only signal. */
export const CAFE_STATUS_TONES: Record<CafeOrderStatus, string> = {
  NEW: "bg-blue-100 text-blue-800 border-blue-200",
  PREPARING: "bg-amber-100 text-amber-800 border-amber-200",
  READY: "bg-emerald-100 text-emerald-800 border-emerald-200",
  COMPLETED: "bg-muted text-muted-foreground border-border",
  CANCELLED: "bg-muted text-muted-foreground border-border",
};

/** Large KDS card accent per status (readable from a distance). */
export const CAFE_STATUS_CARD_TONES: Record<CafeOrderStatus, string> = {
  NEW: "border-blue-300 bg-blue-50",
  PREPARING: "border-amber-300 bg-amber-50",
  READY: "border-emerald-300 bg-emerald-50",
  COMPLETED: "border-border bg-muted/40",
  CANCELLED: "border-border bg-muted/40",
};

export function formatEgp(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded.toLocaleString("ar-EG", { maximumFractionDigits: 2 })} ج.م`;
}

/** Formats an elapsed duration like "04:32" from seconds. */
export function formatAge(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}
