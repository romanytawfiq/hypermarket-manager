"use client";

import Link from "next/link";
import { AlertTriangleIcon, XCircleIcon, AlertCircleIcon, PackageSearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface InventoryAlertsProps {
  data: {
    lowStockCount: number;
    outOfStockCount: number;
    expiringCount: number;
    expiredCount: number;
    replenishmentCount: number;
  } | null;
  className?: string;
  canViewInventory?: boolean;
}

const alerts = [
  {
    key: "lowStockCount",
    label: "مخزون منخفض",
    description: "منتجات وصلت لحد إعادة الطلب",
    icon: AlertTriangleIcon,
    color: "amber",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    href: "/inventory?filter=low",
  },
  {
    key: "outOfStockCount",
    label: "نفد المخزون",
    description: "منتجات غير متاحة للبيع",
    icon: XCircleIcon,
    color: "rose",
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-700",
    href: "/inventory?filter=out",
  },
  {
    key: "expiringCount",
    label: "يوشك على الانتهاء",
    description: "دفعات تقترب من تاريخ الانتهاء",
    icon: AlertCircleIcon,
    color: "orange",
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-700",
    href: "/inventory/expiry",
  },
  {
    key: "expiredCount",
    label: "منتهي الصلاحية",
    description: "دفعات انتهى تاريخ صلاحيتها",
    icon: XCircleIcon,
    color: "red",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-700",
    href: "/inventory/expiry?status=expired",
  },
  {
    key: "replenishmentCount",
    label: "تحتاج إعادة توريد",
    description: "منتجات أقل من الحد الأدنى",
    icon: PackageSearchIcon,
    color: "blue",
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    href: "/inventory/replenishment",
  },
] as const;

export function InventoryAlerts({ data, className, canViewInventory = true }: InventoryAlertsProps) {
  if (!canViewInventory) {
    return null;
  }

  if (!data) {
    return (
      <div className={cn("rounded-lg border bg-background p-8 text-center", className)}>
        <p className="text-sm text-muted-foreground">لا توجد تنبيهات مخزون</p>
      </div>
    );
  }

  const hasAlerts =
    data.lowStockCount > 0 ||
    data.outOfStockCount > 0 ||
    data.expiringCount > 0 ||
    data.expiredCount > 0 ||
    data.replenishmentCount > 0;

  if (!hasAlerts) {
    return (
      <div className={cn("rounded-lg border bg-background p-8 text-center", className)}>
        <div className="inline-flex items-center justify-center size-12 rounded-full bg-emerald-100 text-emerald-600 mb-3">
          <AlertTriangleIcon className="size-6" aria-hidden />
        </div>
        <p className="text-sm text-muted-foreground">لا توجد تنبيهات مخزون حاليًا</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {alerts.map((alert) => {
        const count = data[alert.key as keyof typeof data] as number;
        if (!count || count === 0) return null;

        const Icon = alert.icon;
        return (
          <Link
            key={alert.key}
            href={alert.href}
            className={cn(
              "flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-md",
              alert.bg,
              alert.border
            )}
          >
            <div className={cn("flex size-10 items-center justify-center rounded-lg", alert.bg, alert.text)}>
              <Icon className="size-5" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className={cn("font-medium text-sm truncate", alert.text)}>{alert.label}</p>
              <p className="text-xs text-muted-foreground truncate">{alert.description}</p>
            </div>
            <Badge variant="outline" className={cn("font-bold", alert.text, `border-${alert.color}-300`)}>
              {count.toLocaleString("ar-EG")}
            </Badge>
          </Link>
        );
      })}
    </div>
  );
}