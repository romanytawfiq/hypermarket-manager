"use client";

import { useEffect, useRef } from "react";
import { PrinterIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Auto-print toolbar for dedicated print pages (Phase 8).
 *
 * Triggers `window.print()` once on mount (opening the print dialog for the
 * opened receipt) and offers manual print + window-close fallbacks. The whole
 * toolbar is hidden when printing (`print:hidden`).
 */
export function AutoPrint() {
  const fired = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || fired.current) return;
    fired.current = true;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="print:hidden mb-4 flex flex-wrap items-center justify-center gap-2">
      <Button type="button" size="sm" onClick={() => window.print()}>
        <PrinterIcon className="size-4" aria-hidden />
        طباعة
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => window.close()}
      >
        <XIcon className="size-4" aria-hidden />
        إغلاق النافذة
      </Button>
    </div>
  );
}