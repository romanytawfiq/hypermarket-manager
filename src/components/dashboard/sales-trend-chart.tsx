"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
} from "recharts";
import { cn } from "@/lib/utils";

interface SalesTrendChartProps {
  data: Array<{ date: string; total: number; count: number }>;
  className?: string;
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ar-EG", { weekday: "short", day: "numeric", month: "short" });
}

function formatEgpShort(amount: number): string {
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(1)}م`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}ك`;
  return amount.toLocaleString("ar-EG");
}

function formatEgp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.round(Math.abs(amount)).toLocaleString("ar-EG")} ج.م`;
}

export function SalesTrendChart({ data, className }: SalesTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn("rounded-lg border bg-background p-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">لا توجد بيانات مبيعات لعرض الاتجاه</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    dateLabel: formatDateShort(d.date),
    totalShort: formatEgpShort(d.total),
  }));

  const maxTotal = Math.max(...chartData.map((d) => d.total), 1);

  return (
    <div className={cn("rounded-lg border bg-background p-4", className)}>
      <div className="h-64" style={{ width: "100%" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#E2E8F0"
              vertical={false}
              horizontal={true}
            />
            <XAxis
              dataKey="dateLabel"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#64748B" }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#64748B" }}
              tickFormatter={formatEgpShort}
              tickCount={4}
              domain={["auto", maxTotal * 1.15]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #E2E8F0",
                borderRadius: "8px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                padding: "8px 12px",
              }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(value: any, name: string | number | undefined) => {
                if (value == null) return [0, String(name ?? "")] as const;
                if (name === "total") return [formatEgp(value), "المبيعات"] as const;
                if (name === "count") return [value.toLocaleString("ar-EG"), "عدد الفواتير"] as const;
                return [value, String(name ?? "")] as const;
              }}
              labelFormatter={(label: React.ReactNode) => (label ? formatDateShort(String(label)) : "")}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3B82F6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#salesGradient)"
              connectNulls={true}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6, fill: "#3B82F6", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
        <span>آخر 7 أيام</span>
        <span className="font-medium text-foreground">
          إجمالي: {formatEgp(chartData.reduce((sum, d) => sum + d.total, 0))}
        </span>
      </div>
    </div>
  );
}