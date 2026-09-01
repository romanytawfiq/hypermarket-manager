"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

interface FinancialSummaryProps {
  receivables: { total: number; customerCount: number } | null;
  payables: { total: number; supplierCount: number } | null;
  expenses: { total: number; cash: number; count: number } | null;
  grossProfit: number | null;
  netProfit: number | null;
  canViewReceivables: boolean;
  canViewPayables: boolean;
  canViewExpenses: boolean;
  canViewProfit: boolean;
  className?: string;
}

export function FinancialSummary({
  receivables,
  payables,
  expenses,
  grossProfit,
  netProfit,
  canViewReceivables,
  canViewPayables,
  canViewExpenses,
  canViewProfit,
  className,
}: FinancialSummaryProps) {
  const sections: Array<{
    condition: boolean;
    title: string;
    href: string;
    children: React.ReactNode;
  }> = [
    {
      condition: canViewReceivables && receivables !== null,
      title: "مستحقات العملاء",
      href: "/customers",
      children: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">إجمالي المستحقات</span>
            <span className={cn("text-xl font-bold", receivables!.total > 0 ? "text-rose-700" : "text-emerald-700")}>
              {formatEgp(receivables!.total)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">عملاء لديهم أرصدة</span>
            <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">
              {receivables!.customerCount.toLocaleString("ar-EG")}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      condition: canViewPayables && payables !== null,
      title: "مستحقات الموردين",
      href: "/suppliers",
      children: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">إجمالي المستحقات</span>
            <span className={cn("text-xl font-bold", payables!.total > 0 ? "text-rose-700" : "text-emerald-700")}>
              {formatEgp(payables!.total)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">موردين لديهم أرصدة</span>
            <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">
              {payables!.supplierCount.toLocaleString("ar-EG")}
            </Badge>
          </div>
        </div>
      ),
    },
    {
      condition: canViewExpenses && expenses !== null,
      title: "المصروفات",
      href: "/expenses",
      children: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">إجمالي المصروفات</span>
            <span className="text-xl font-bold text-foreground">{formatEgp(expenses!.total)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">نقدي</span>
              <span className="font-medium">{formatEgp(expenses!.cash)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">عدد العمليات</span>
              <Badge variant="outline" className="text-muted-foreground border-muted-foreground/50">
                {expenses!.count.toLocaleString("ar-EG")}
              </Badge>
            </div>
          </div>
        </div>
      ),
    },
    {
      condition: canViewProfit && grossProfit !== null && netProfit !== null,
      title: "الربحية",
      href: "/accounting",
      children: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">إجمالي الربح الخام</span>
            <span className={cn("text-xl font-bold", grossProfit! >= 0 ? "text-emerald-700" : "text-rose-700")}>
              {formatEgp(grossProfit!)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">صافي الربح</span>
            <span className={cn("text-xl font-bold", netProfit! >= 0 ? "text-emerald-700" : "text-rose-700")}>
              {formatEgp(netProfit!)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            الربح الخام = المبيعات - تكلفة البضاعة | صافي الربح = الربح الخام - المصروفات
          </p>
        </div>
      ),
    },
  ].filter((s) => s.condition);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {sections.map((section) => (
        <div key={section.title} className="rounded-lg border bg-background p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
            <Link
              href={section.href}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              التفاصيل
              <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </Link>
          </div>
          {section.children}
        </div>
      ))}
    </div>
  );
}