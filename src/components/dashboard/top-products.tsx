"use client";

import { cn } from "@/lib/utils";

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

function formatNumber(num: number): string {
  return Math.round(Math.abs(num)).toLocaleString("ar-EG");
}

interface TopProductsProps {
  data: Array<{ productName: string; quantity: number; revenue: number }> | null;
  className?: string;
  canViewSales?: boolean;
}

export function TopProducts({ data, className, canViewSales = true }: TopProductsProps) {
  if (!canViewSales) {
    return null;
  }

  if (!data || data.length === 0) {
    return (
      <div className={cn("rounded-lg border bg-background p-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">لا توجد مبيعات خلال هذه الفترة</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-background", className)}>
      <div className="border-b bg-muted/30 px-4 py-3">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm font-medium text-muted-foreground">
          <span>المنتج</span>
          <span className="text-center">الكمية</span>
          <span className="text-end">الإيراد</span>
        </div>
      </div>
      <div className="divide-y">
        {data.map((product) => (
          <div
            key={product.productName}
            className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 py-3 text-sm items-center hover:bg-muted/30 transition-colors"
          >
            <span className="font-medium text-foreground truncate">{product.productName}</span>
            <span className="text-center text-muted-foreground font-medium">
              {formatNumber(product.quantity)}
            </span>
            <span className="text-end text-foreground font-medium">{formatEgp(product.revenue)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}