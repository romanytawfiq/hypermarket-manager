import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOnlineOrder } from "@/services/online-store.service";
import { AppError } from "@/lib/errors";
import { OrderDetailClient } from "@/components/admin/order-detail-client";

export const metadata: Metadata = {
  title: "تفاصيل الطلب — نكسا ريتيل",
};

/**
 * Online order detail (Phase 9). Authorized via `online.orders.read`; the route
 * itself is inside the protected (dashboard) layout, so anonymous access is
 * already redirected. A user without the permission is redirected home and never
 * sees another customer's order data (no authorization bypass).
 */
export default async function OnlineOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = (await getCurrentUser())!;

  if (user.permissions.has("online.orders.read") === false) {
    redirect("/");
  }

  let order;
  try {
    order = await getOnlineOrder(user, id);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <OrderDetailClient
      order={order}
      canManage={user.permissions.has("online.orders.manage")}
    />
  );
}