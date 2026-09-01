"use client";

import { useState, useTransition } from "react";
import { getDashboardAction } from "@/actions/dashboard-actions";
import type { DashboardData, DashboardPeriod } from "@/services/dashboard.service";
import { can } from "@/services/authorization.service";
import type { AuthUser } from "@/services/auth.service";

import { KPICard, PeriodSelector, Panel } from "@/components/dashboard/dashboard-ui";
import { SalesTrendChart } from "@/components/dashboard/sales-trend-chart";
import { PaymentBreakdown } from "@/components/dashboard/payment-breakdown";
import { InventoryAlerts } from "@/components/dashboard/inventory-alerts";
import { TopProducts } from "@/components/dashboard/top-products";
import { FinancialSummary } from "@/components/dashboard/financial-summary";
import { ShiftSummary } from "@/components/dashboard/shift-summary";
import { QuickActions } from "@/components/dashboard/quick-actions";

export function DashboardClient({
  initialData,
  user,
}: {
  initialData: DashboardData;
  user: AuthUser;
}) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<DashboardPeriod>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [, startTransition] = useTransition();

  const canViewSales = can(user, "sales.read");
  const canViewExpenses = can(user, "expenses.read");
  const canViewAccounting = can(user, "accounting.read");
  const canViewCustomers = can(user, "customers.view_ledger");
  const canViewSuppliers = can(user, "suppliers.view_ledger");
  const canViewInventory = can(user, "inventory.read");

  const applyRange = () => {
    startTransition(async () => {
      const next = await getDashboardAction({
        period,
        customFrom: period === "custom" ? customFrom : undefined,
        customTo: period === "custom" ? customTo : undefined,
      });
      if (next) {
        setData(next);
      }
    });
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod as DashboardPeriod);
    if (newPeriod !== "custom") {
      applyRange();
    }
  };

  const handleCustomChange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
  };

  const hasAnyData = data.sales !== null || data.inventoryAlerts !== null || data.activeShift !== null || data.topProducts !== null;

  if (!hasAnyData) {
    return (
      <div className="grid gap-6">
        <div>
          <h1 className="font-heading text-xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">لا توجد بيانات متاحة لعرضها حاليًا</p>
        </div>
        <QuickActions userPermissions={user.permissions} />
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">
            ملخص العمليات · الفترة: {data.period.label}
          </p>
        </div>
      </div>

      <PeriodSelector
        period={period}
        onPeriodChange={handlePeriodChange}
        customFrom={customFrom}
        customTo={customTo}
        onCustomChange={handleCustomChange}
      />

      {/* KPI Row - Sales */}
      {(canViewSales || canViewAccounting) && data.sales && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            label="مبيعات اليوم"
            value={data.sales.total}
            hint={`عدد الفواتير: ${data.sales.count.toLocaleString("ar-EG")}`}
            tone="default"
          />
          <KPICard
            label="المُحصَّل عند الريجستر"
            value={data.sales.collected}
            tone="positive"
          />
          <KPICard
            label="المدفوعات النقدية"
            value={data.salesByMethod?.CASH ?? 0}
            tone="positive"
          />
          <KPICard
            label="المدفوعات غير النقدية"
            value={(data.sales?.total ?? 0) - (data.salesByMethod?.CASH ?? 0)}
            tone="neutral"
          />
        </div>
      )}

      {/* Cashier Shift Summary */}
      {data.activeShift && (
        <Panel title="الوردية الحالية" action={
          <a href="/shifts" className="text-xs text-primary hover:underline">إدارة الورديات</a>
        }>
          <ShiftSummary data={data.activeShift} />
        </Panel>
      )}

      {/* Sales Trend + Payment Breakdown */}
      {(canViewSales || canViewAccounting) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="اتجاه المبيعات (آخر 7 أيام)">
            <SalesTrendChart data={data.salesTrend ?? []} />
          </Panel>
          <Panel title="توزيع طرق الدفع">
            <PaymentBreakdown data={data.salesByMethod ?? null} />
          </Panel>
        </div>
      )}

      {/* Top Products + Inventory Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {(canViewSales || canViewAccounting) && (
          <Panel title="أكثر المنتجات مبيعًا" action={
            <a href="/sales" className="text-xs text-primary hover:underline">عرض المبيعات</a>
          }>
            <TopProducts data={data.topProducts ?? null} canViewSales={canViewSales} />
          </Panel>
        )}
        <Panel title="تنبيهات المخزون" action={
          <a href="/inventory" className="text-xs text-primary hover:underline">عرض المخزون</a>
        }>
          <InventoryAlerts data={data.inventoryAlerts ?? null} canViewInventory={canViewInventory} />
        </Panel>
      </div>

      {/* Financial Summary */}
      <FinancialSummary
        receivables={data.receivables ?? null}
        payables={data.payables ?? null}
        expenses={data.expenses ?? null}
        grossProfit={data.grossProfit}
        netProfit={data.netProfit}
        canViewReceivables={canViewCustomers || canViewAccounting}
        canViewPayables={canViewSuppliers || canViewAccounting}
        canViewExpenses={canViewExpenses}
        canViewProfit={canViewAccounting}
      />

      {/* Quick Actions */}
      <QuickActions userPermissions={user.permissions} />
    </div>
  );
}