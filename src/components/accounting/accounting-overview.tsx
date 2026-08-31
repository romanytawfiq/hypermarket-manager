"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, Loader2Icon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/sales/constants";
import { getAccountingOverviewAction } from "@/actions/accounting-actions";
import type { AccountingOverview as Overview } from "@/services/accounting.service";

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

function Card({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "positive" | "negative" | "neutral";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : tone === "neutral"
          ? "text-zinc-600"
          : "text-foreground";
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 rounded-lg border bg-background p-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {children}
    </div>
  );
}

export function AccountingOverview({ initial, canViewExpenses }: { initial: Overview; canViewExpenses: boolean }) {
  const [data, setData] = useState(initial);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rangeLabel, setRangeLabel] = useState("كل الفترات");
  const [pending, startTransition] = useTransition();

  const applyRange = () => {
    startTransition(async () => {
      const next = await getAccountingOverviewAction({
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      if (next) {
        setData(next);
        setRangeLabel(dateFrom || dateTo ? "فترة مخصصة" : "كل الفترات");
      }
    });
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المحاسبة — نظرة عامة</h1>
          <p className="text-sm text-muted-foreground">
            ملخص مجمَّع من المعاملات المالية الفعلية · الفترة: {rangeLabel}
          </p>
        </div>
        {canViewExpenses ? (
          <Button variant="outline" render={<Link href="/expenses" />}>
            عرض المصروفات
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="acc-from">من تاريخ</Label>
          <Input id="acc-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="acc-to">إلى تاريخ</Label>
          <Input id="acc-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <Button onClick={applyRange} disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          <SearchIcon className="size-4" aria-hidden />
          تطبيق
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="المبيعات">
          <Card label="إجمالي فواتير البيع" value={formatEgp(data.sales.total)} />
          <Card label="المُحصَّل عند الريجستر" value={formatEgp(data.sales.collected)} hint={`عدد الفواتير: ${data.sales.count.toLocaleString("ar-EG")}`} tone="neutral" />
        </Panel>
        <Panel title="المشتريات">
          <Card label="إجمالي المشتريات" value={formatEgp(data.purchases.total)} hint={`عدد المشتريات: ${data.purchases.count.toLocaleString("ar-EG")}`} />
          <Card label="مدفوع نقدًا للموردين" value={formatEgp(data.purchases.cashPaid)} tone="neutral" />
        </Panel>
        <Panel title="المصروفات">
          <Card label="إجمالي المصروفات" value={formatEgp(data.expenses.total)} hint={`عدد العمليات: ${data.expenses.count.toLocaleString("ar-EG")}`} />
          <Card label="نقدي منها" value={formatEgp(data.expenses.cash)} tone="neutral" />
        </Panel>
        <Panel title="النتيجة">
          <Card label="إجمالي الربح الخام (مبدئي)" value={formatEgp(data.grossProfit)} hint="المبيعات ناقص تكلفة البضاعة" tone={data.grossProfit >= 0 ? "positive" : "negative"} />
          <Card label="صافي الربح (مبدئي)" value={formatEgp(data.netProfit)} hint="الربح الخام ناقص المصروفات — لا يشمل المرتجعات" tone={data.netProfit >= 0 ? "positive" : "negative"} />
        </Panel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Panel title="الأرصدة الحالية">
          <Card label="مستحقات العملاء (ذمم مدينة)" value={formatEgp(data.receivable)} tone={data.receivable > 0 ? "negative" : "positive"} />
          <Card label="مستحقات الموردين (ذمم دائنة)" value={formatEgp(data.payable)} tone={data.payable > 0 ? "negative" : "positive"} />
          <p className="text-xs text-muted-foreground">ناتجة عن السجلات المالية عبر كل الفترات</p>
        </Panel>

        <Panel title="التدفق النقدي الفعلي">
          <Card
            label="النقد الوارد"
            value={formatEgp(data.cashIn)}
            hint="مبيعات نقدية + دفعات عملاء نقدية + إيداعات نقدية"
            tone="positive"
          />
          <Card
            label="النقد الصادر"
            value={formatEgp(data.cashOut)}
            hint="مدفوعات موردين نقدية + مصروفات نقدية + سحوبات نقدية"
            tone="negative"
          />
          <Card label="صافي التدفق النقدي" value={formatEgp(data.netCashFlow)} tone={data.netCashFlow >= 0 ? "positive" : "negative"} />
        </Panel>

        <Panel title="توزيع طرق دفع المبيعات">
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map((m) =>
              data.salesByMethod[m] > 0 ? (
                <div key={m} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{paymentMethodLabel(m)}</span>
                  <span className="font-semibold">{formatEgp(data.salesByMethod[m])}</span>
                </div>
              ) : null,
            )}
            {PAYMENT_METHODS.every((m) => data.salesByMethod[m] === 0) ? (
              <p className="text-sm text-muted-foreground">لا توجد مبيعات في هذه الفترة</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><ArrowUpIcon className="size-3 text-emerald-600" aria-hidden /> نقدي فعلي</span>
            <span className="inline-flex items-center gap-1"><ArrowDownIcon className="size-3 text-rose-600" aria-hidden /> نقد صادر</span>
          </div>
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">ملاحظة:</span> الصافي المبدئي لا يشمل مبيعات/مشتريات مرتجعة
        (في حال وجودها). الأسعار والتكلفة والأرصدة هي المرجعية من سجلاتك الموثوقة على الخادم.
      </p>
    </div>
  );
}
