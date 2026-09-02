"use client";

import { useEffect, useState } from "react";
import { getSaleReceiptAction } from "@/actions/receipt-actions";
import type { ReceiptViewModel } from "@/services/receipt.service";
import { ReceiptPreview } from "@/components/printing/receipt-preview";
import { Loader2Icon } from "lucide-react";

/**
 * Fetches the authoritative receipt view model for a sale and shows the
 * interactive preview inside a dialog (POS success, sales history).
 * Loading / empty / error states are explicit.
 */
export function SaleReceiptDialog({
  saleId,
  canPrint = true,
  onClose,
}: {
  saleId: string;
  canPrint?: boolean;
  onClose: () => void;
}) {
  const [receipt, setReceipt] = useState<ReceiptViewModel | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    getSaleReceiptAction(saleId)
      .then((vm) => {
        if (cancelled) return;
        setReceipt(vm);
        setStatus(vm ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [saleId]);

  if (status === "loading") {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden />
        جارٍ تحضير الفاتورة…
      </p>
    );
  }

  if (status === "error" || !receipt) {
    return (
      <div className="grid gap-3 py-4 text-center text-sm">
        <p className="text-muted-foreground">
          تعذر تحضير الفاتورة من السجلات. أعد المحاولة من سجل المبيعات.
        </p>
        <div>
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={onClose}
          >
            إغلاق
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReceiptPreview
      receipt={receipt}
      printHref={`/print/sale/${saleId}`}
      canPrint={canPrint}
      onClose={onClose}
    />
  );
}