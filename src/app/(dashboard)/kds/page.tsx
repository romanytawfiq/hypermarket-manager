import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listKdsOrders } from "@/services/cafe.service";
import type { CafeOrderDto } from "@/services/cafe.service";
import { AppError } from "@/lib/errors";
import { KdsBoard } from "@/components/kds/kds-board";

export const metadata: Metadata = {
  title: "شاشة الباريستا — نكسا ريتيل",
};

export default async function KdsPage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("cafe.kds.view") === false) {
    redirect("/");
  }

  let orders: CafeOrderDto[] = [];
  try {
    orders = await listKdsOrders(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <KdsBoard
      initialOrders={orders}
      canCancel={user.permissions.has("cafe.orders.cancel")}
    />
  );
}
