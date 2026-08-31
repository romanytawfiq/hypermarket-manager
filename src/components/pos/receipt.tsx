"use client";

import { useState } from "react";
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { paymentMethodLabel } from "@/lib/sales/constants";
import type { SaleDto } from "@/services/sales.service";
import { cn } from "@/lib/utils";

function formatEgp(n: number): string {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}

const WIDTHS = {
  "58mm": "58mm",
  "80mm": "80mm",
} as const;

export function Receipt({
  sale,
  terminalWidth = "80mm",
  onClose,
  canPrint = true,
}: {
  sale: SaleDto;
  terminalWidth?: "58mm" | "80mm";
  onClose?: () => void;
  canPrint?: boolean;
}) {
  const [width, setWidth] = useState<"58mm" | "80mm">(terminalWidth);
  const w = WIDTHS[width];

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ar-EG", {
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant={width === "58mm" ? "default" : "outline"}
            size="sm"
            type="button"
            onClick={() => setWidth("58mm")}
          >
            58مم
          </Button>
          <Button
            variant={width === "80mm" ? "default" : "outline"}
            size="sm"
            type="button"
            onClick={() => setWidth("80mm")}
          >
            80مم
          </Button>
        </div>
        {canPrint ? (
          <Button type="button" size="sm" onClick={() => window.print()}>
            <PrinterIcon className="size-4" aria-hidden />
            طباعة الفاتورة
          </Button>
        ) : null}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area { position: absolute; inset: 0; width: ${w}; }
        }
      `}</style>

      <div
        id="receipt-print-area"
        dir="rtl"
        className={cn(
          "mx-auto overflow-hidden rounded-lg border bg-white p-3 text-foreground",
        )}
        style={{ width: w }}
      >
        <div className="text-center">
          <p className="text-sm font-bold">نكسا ريتيل</p>
          <p className="text-[10px] text-muted-foreground">سوبر ماركت وكافيه</p>
        </div>

        <Separator />

        <div className="space-y-1 text-[10px]">
          <Row label="رقم الفاتورة" value={sale.invoiceNumber} />
          <Row label="التاريخ" value={formatDateTime(sale.createdAt)} />
          <Row label="الكاشير" value={sale.cashier?.username || "—"} />
          {sale.customerName ? <Row label="العميل" value={sale.customerName} /> : null}
        </div>

        <Separator />

        <div className="text-[10px]">
          {sale.items.map((item, idx) => (
            <div key={`${item.productId}-${idx}`} className="flex flex-col gap-0.5 py-0.5">
              <div className="flex items-start justify-between gap-2">
                <span className="font-medium">{item.productName}</span>
                <span dir="ltr">{formatEgp(item.lineTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>
                  {item.quantity} × {formatEgp(item.unitPrice)}
                </span>
                <span />
              </div>
            </div>
          ))}
        </div>

        <Separator />

        <div className="space-y-1 text-[10px]">
          <Row label="الإجمالي" value={formatEgp(sale.totalAmount)} strong />
          {sale.payments.map((p, i) => (
            <Row key={`${p.method}-${i}`} label={paymentMethodLabel(p.method)} value={formatEgp(p.amount)} />
          ))}
          {sale.cashTendered != null ? (
            <Row label="المدفوع نقدًا" value={formatEgp(sale.cashTendered)} />
          ) : null}
          {sale.change != null && sale.change > 0 ? (
            <Row label="الباقي" value={formatEgp(sale.change)} />
          ) : null}
        </div>

        <Separator />

        <p className="pt-1 text-center text-[10px]">شكرًا لزيارتكم</p>
        {onClose ? (
          <div className="mt-3 flex justify-center print:hidden">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className={strong ? "font-bold" : undefined}>{value}</span>
    </div>
  );
}

function Separator() {
  return <div className="mt-2 mb-2 border-t border-dashed border-zinc-300" />;
}
