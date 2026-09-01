"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ClockIcon, ReceiptTextIcon, DollarSignIcon } from "lucide-react";

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
}

interface ShiftSummaryProps {
  data: {
    id: string;
    openingCash: number;
    openedAt: string;
    salesCount: number;
    cashSales: number;
  } | null;
  className?: string;
}

export function ShiftSummary({ data, className }: ShiftSummaryProps) {
  if (!data) {
    return (
      <div className={cn("rounded-lg border bg-background p-4 text-center", className)}>
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-amber-100 text-amber-600 mb-3">
          <ClockIcon className="size-6" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground mb-4">لا توجد وردية مفتوحة</p>
        <Link href="/shifts" className="inline-flex w-full">
          <Button className="w-full justify-center gap-2" size="lg">
            <ClockIcon className="size-4" aria-hidden />
            فتح وردية جديدة
          </Button>
        </Link>
      </div>
    );
  }

  const expectedCash = data.openingCash + data.cashSales;

  return (
    <div className={cn("rounded-lg border bg-background p-4 space-y-4", className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">الوردية الحالية</p>
          <p className="text-xs text-muted-foreground">مفتوحة منذ {formatTime(data.openedAt)}</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-medium">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          نشطة
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border bg-muted/30 p-3 text-center">
          <ReceiptTextIcon className="size-5 mx-auto text-muted-foreground mb-1" aria-hidden />
          <p className="text-2xl font-bold text-foreground">{data.salesCount.toLocaleString("ar-EG")}</p>
          <p className="text-xs text-muted-foreground">فواتير</p>
        </div>
        <div className="rounded-lg border bg-emerald-50 p-3 text-center">
          <DollarSignIcon className="size-5 mx-auto text-emerald-600 mb-1" aria-hidden />
          <p className="text-xl font-bold text-emerald-700">{formatEgp(data.cashSales)}</p>
          <p className="text-xs text-emerald-600">مبيعات نقدية</p>
        </div>
        <div className="rounded-lg border bg-blue-50 p-3 text-center">
          <ClockIcon className="size-5 mx-auto text-blue-600 mb-1" aria-hidden />
          <p className="text-xl font-bold text-blue-700">{formatEgp(expectedCash)}</p>
          <p className="text-xs text-blue-600">النقد المتوقع</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Link href="/pos" className="flex-1">
          <Button variant="outline" className="w-full justify-center gap-2">
            <ReceiptTextIcon className="size-4" aria-hidden />
            نقطة البيع
          </Button>
        </Link>
        <Link href="/shifts" className="flex-1">
          <Button className="w-full justify-center gap-2">
            <ClockIcon className="size-4" aria-hidden />
            إغلاق الوردية
          </Button>
        </Link>
      </div>
    </div>
  );
}