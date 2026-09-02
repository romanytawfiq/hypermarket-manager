"use client";

import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethod } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

interface PaymentBreakdownProps {
  data: Record<PaymentMethod, number> | null;
  className?: string;
}

const METHOD_ICONS: Record<PaymentMethod, string> = {
  CASH: "💵",
  VISA: "💳",
  MASTERCARD: "💳",
  INSTAPAY: "📱",
  VODAFONE_CASH: "📱",
  ONLINE: "🖥️",
  OTHER: "💰",
};

export function PaymentBreakdown({ data, className }: PaymentBreakdownProps) {
  if (!data || Object.values(data).every((v) => v === 0)) {
    return (
      <div className={cn("rounded-lg border bg-background p-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">لا توجد مدفوعات في هذه الفترة</p>
      </div>
    );
  }

  const total = Object.values(data).reduce((sum, v) => sum + v, 0);
  const cashTotal = data.CASH ?? 0;
  const nonCashTotal = total - cashTotal;

  return (
    <div className={cn("rounded-lg border bg-background p-4", className)}>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="rounded-lg border bg-emerald-50 p-3 text-center">
          <p className="text-xs text-emerald-700 font-medium">نقدي فعلي</p>
          <p className="text-lg font-bold text-emerald-900">{formatEgp(cashTotal)}</p>
          <p className="text-xs text-emerald-600">{(total > 0 ? (cashTotal / total) * 100 : 0).toFixed(0)}%</p>
        </div>
        <div className="rounded-lg border bg-blue-50 p-3 text-center">
          <p className="text-xs text-blue-700 font-medium">غير نقدي</p>
          <p className="text-lg font-bold text-blue-900">{formatEgp(nonCashTotal)}</p>
          <p className="text-xs text-blue-600">{(total > 0 ? (nonCashTotal / total) * 100 : 0).toFixed(0)}%</p>
        </div>
      </div>

      <div className="space-y-2">
        {PAYMENT_METHODS.map((method) => {
          const amount = data[method] ?? 0;
          if (amount === 0) return null;

          const isCash = method === "CASH";
          return (
            <div
              key={method}
              className={cn(
                "flex items-center justify-between rounded-lg border p-3 text-sm transition-colors",
                isCash ? "bg-emerald-50 border-emerald-100" : "bg-muted/30"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-lg" aria-hidden>{METHOD_ICONS[method]}</span>
                <span className="font-medium text-foreground">{paymentMethodLabel(method)}</span>
              </div>
              <div className="flex items-center gap-3 text-end">
                <span className={cn("font-semibold", isCash ? "text-emerald-700" : "text-foreground")}>
                  {formatEgp(amount)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(total > 0 ? (amount / total) * 100 : 0).toFixed(1)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground text-center">
        إجمالي المبيعات: <span className="font-medium text-foreground">{formatEgp(total)}</span>
      </p>
    </div>
  );
}