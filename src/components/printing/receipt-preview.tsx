"use client";

import { useState } from "react";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReceiptViewModel } from "@/services/receipt.service";
import {
  ReceiptDocument,
  RECEIPT_WIDTHS,
  type ReceiptWidth,
} from "@/components/printing/receipt-document";

/**
 * Interactive receipt preview (Phase 8), used inside dialogs (POS success,
 * sales history, shift view).
 *
 * Shows a width-toggled preview of an already-loaded `ReceiptViewModel` and a
 * print action that opens the dedicated, server-authorized print route in a
 * new window — the canonical print path. Direct `window.print()` is intentionally
 * not used here: the print route guarantees the same document is printable even
 * when the dialog data was hydrated separately.
 */
export function ReceiptPreview({
  receipt,
  printHref,
  canPrint = true,
  defaultWidth = "80mm",
  onClose,
}: {
  receipt: ReceiptViewModel;
  /** Route to the server-authorized print page for this document (e.g. `/print/sale/{id}`). */
  printHref: string;
  canPrint?: boolean;
  defaultWidth?: ReceiptWidth;
  onClose?: () => void;
}) {
  const [width, setWidth] = useState<ReceiptWidth>(defaultWidth);

  const openPrintPage = () => {
    const url = `${printHref}?w=${width}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {RECEIPT_WIDTHS.map((w) => (
            <Button
              key={w}
              variant={width === w ? "default" : "outline"}
              size="sm"
              type="button"
              onClick={() => setWidth(w)}
            >
              {w === "58mm" ? "58مم" : "80مم"}
            </Button>
          ))}
        </div>
        {canPrint ? (
          <Button type="button" size="sm" onClick={openPrintPage}>
            <PrinterIcon className="size-4" aria-hidden />
            طباعة الفاتورة
          </Button>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background p-4 [&>div]:shadow-none sm:p-6">
        <ReceiptDocument receipt={receipt} width={width} />
      </div>

      {onClose ? (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      ) : null}
    </div>
  );
}