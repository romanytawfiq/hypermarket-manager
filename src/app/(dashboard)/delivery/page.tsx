import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listDeliveryOrders } from "@/services/online-store.service";
import type { OnlineOrderDto } from "@/services/online-store.service";
import { AppError } from "@/lib/errors";
import { DeliveryBoard } from "@/components/delivery/delivery-board";

export const metadata: Metadata = {
  title: "التوصيل — نكسا ريتيل",
};

/**
 * Delivery workflow (Phase 9). For DELIVERY-role employees (and Owner/Manager).
 * Fulfillment actions run server-side and recreate the Sale via the collector's
 * open shift when COD is collected at delivery.
 */
export default async function DeliveryPage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("delivery.orders.read") === false) {
    redirect("/");
  }

  let orders: OnlineOrderDto[] = [];
  try {
    orders = await listDeliveryOrders(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  const canCollect =
    (user.permissions.has("delivery.orders.update") || user.permissions.has("online.orders.manage")) &&
    user.permissions.has("sales.create");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-heading text-xl font-bold">لوحة التوصيل</h1>
        <p className="text-sm text-muted-foreground">مهمات التوصيل والتحصيل عند الاستلام</p>
      </div>
      <DeliveryBoard initial={orders} canCollect={canCollect} />
    </div>
  );
}