"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  ShoppingCartIcon,
  PackageIcon,
  TruckIcon,
  UsersIcon,
  HandCoinsIcon,
  WarehouseIcon,
  PlusIcon,
  PackageSearchIcon,
} from "lucide-react";

interface QuickAction {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: string;
}

const ALL_ACTIONS: QuickAction[] = [
  { label: "نقطة البيع", href: "/pos", icon: <ShoppingCartIcon className="size-5" />, permission: "sales.create" },
  { label: "إضافة منتج", href: "/products/new", icon: <PackageIcon className="size-5" />, permission: "products.create" },
  { label: "استلام بضاعة", href: "/purchases/receive", icon: <TruckIcon className="size-5" />, permission: "purchases.receive" },
  { label: "تسجيل دفعة عميل", href: "/customers/payments/new", icon: <UsersIcon className="size-5" />, permission: "customer_payments.create" },
  { label: "تسجيل دفعة مورد", href: "/suppliers/payments/new", icon: <HandCoinsIcon className="size-5" />, permission: "supplier_payments.create" },
  { label: "إضافة مصروف", href: "/expenses/new", icon: <PlusIcon className="size-5" />, permission: "expenses.create" },
  { label: "عرض المخزون", href: "/inventory", icon: <WarehouseIcon className="size-5" />, permission: "inventory.read" },
  { label: "إعادة التخزين", href: "/inventory/replenishment", icon: <PackageSearchIcon className="size-5" />, permission: "inventory.view_replenishment" },
];

interface QuickActionsProps {
  userPermissions: ReadonlySet<string>;
  className?: string;
}

export function QuickActions({ userPermissions, className }: QuickActionsProps) {
  const allowedActions = ALL_ACTIONS.filter((action) => !action.permission || userPermissions.has(action.permission));

  if (allowedActions.length === 0) {
    return null;
  }

  return (
    <div className={cn("rounded-lg border bg-background p-4", className)}>
      <h2 className="text-sm font-semibold text-foreground mb-3">إجراءات سريعة</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {allowedActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className={cn(
              "flex items-center justify-center gap-3 h-14 text-sm rounded-lg border bg-background hover:bg-muted/50 transition-colors",
              "justify-start"
            )}
          >
            <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {action.icon}
            </span>
            <span className="font-medium">{action.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}