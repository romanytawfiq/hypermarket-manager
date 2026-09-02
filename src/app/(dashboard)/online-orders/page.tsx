import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { OnlineOrdersAdmin } from "@/components/admin/online-orders-admin";

export const metadata: Metadata = {
  title: "الطلبات — نكسا ريتيل",
};

/**
 * Online store order management (Phase 9). Restricted to `online.orders.read`
 * holders (Owner/Manager). All transitions are enforced server-side.
 */
export default async function OnlineOrdersPage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("online.orders.read") === false) {
    redirect("/");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-bold">الطلبات</h1>
        <p className="text-sm text-muted-foreground">إدارة طلبات المتجر والتوصيل</p>
      </div>
      <OnlineOrdersAdmin canManage={user.permissions.has("online.orders.manage")} />
    </div>
  );
}