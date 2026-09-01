"use client";

import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from "lucide-react";

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

interface KPICardProps {
  label: string;
  value: string | number;
  hint?: string;
  trend?: { value: number; label: string } | null;
  tone?: "default" | "positive" | "negative" | "neutral" | "warning";
  icon?: React.ReactNode;
}

export function KPICard({
  label,
  value,
  hint,
  trend,
  tone = "default",
  icon,
}: KPICardProps) {
  const displayValue = typeof value === "number" ? formatEgp(value) : value;

  const toneClass =
    tone === "positive"
      ? "text-emerald-700"
      : tone === "negative"
        ? "text-rose-700"
        : tone === "warning"
          ? "text-amber-700"
          : tone === "neutral"
            ? "text-zinc-600"
            : "text-foreground";

  const trendColor = trend
    ? trend.value > 0
      ? "text-emerald-600"
      : trend.value < 0
        ? "text-rose-600"
        : "text-zinc-600"
    : "text-zinc-600";

  const TrendIcon = trend
    ? trend.value > 0
      ? TrendingUpIcon
      : trend.value < 0
        ? TrendingDownIcon
        : MinusIcon
    : null;

  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground truncate">{label}</p>
          <p className={`mt-1 text-2xl font-bold ${toneClass} truncate`}>{displayValue}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground truncate">{hint}</p>}
          {trend && TrendIcon && (
            <div className="mt-2 flex items-center gap-1.5">
              <TrendIcon className={`size-3.5 ${trendColor}`} aria-hidden />
              <span className={`text-xs font-medium ${trendColor}`}>
                {trend.value > 0 ? "+" : ""}{trend.value.toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        {icon && <div className="shrink-0 text-muted-foreground/50">{icon}</div>}
      </div>
    </div>
  );
}

interface PeriodSelectorProps {
  period: string;
  onPeriodChange: (period: string) => void;
  customFrom?: string;
  customTo?: string;
  onCustomChange?: (from: string, to: string) => void;
}

const PERIODS = [
  { value: "today", label: "اليوم" },
  { value: "week", label: "هذا الأسبوع" },
  { value: "month", label: "هذا الشهر" },
  { value: "custom", label: "فترة مخصصة" },
] as const;

export function PeriodSelector({ period, onPeriodChange, customFrom, customTo, onCustomChange }: PeriodSelectorProps) {
  const showCustom = period === "custom";

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-3">
      <div className="grid gap-1.5">
        <label htmlFor="dash-period" className="text-sm font-medium text-foreground">
          الفترة
        </label>
        <select
          id="dash-period"
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {showCustom && (
        <>
          <div className="grid gap-1.5">
            <label htmlFor="dash-from" className="text-sm font-medium text-foreground">
              من تاريخ
            </label>
            <input
              id="dash-from"
              type="date"
              value={customFrom ?? ""}
              onChange={(e) => onCustomChange?.(e.target.value, customTo ?? "")}
              className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="dash-to" className="text-sm font-medium text-foreground">
              إلى تاريخ
            </label>
            <input
              id="dash-to"
              type="date"
              value={customTo ?? ""}
              onChange={(e) => onCustomChange?.(customFrom ?? "", e.target.value)}
              className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
        </>
      )}
    </div>
  );
}

interface PanelProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

export function Panel({ title, children, action }: PanelProps) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}