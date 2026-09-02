/**
 * Receipt width parsing for print routes (Phase 8).
 * Query parameter `w` selects the thermal paper width; anything invalid falls
 * back to 80mm.
 */

import type { ReceiptWidth } from "@/components/printing/receipt-document";

export function parseReceiptWidth(w: string | undefined): ReceiptWidth {
  return w === "58mm" ? "58mm" : "80mm";
}