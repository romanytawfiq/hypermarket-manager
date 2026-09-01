import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listKdsOrders, listActiveCafeOrders, listCafeOrderHistory } from "@/services/cafe.service";
import type { CafeOrderDto } from "@/services/cafe.service";
import { AppError } from "@/lib/errors";
import { CafeScreen } from "@/components/cafe/cafe-screen";

export const metadata: Metadata = {
  title: "الكافيه — نكسا ريتيل",
};

export default async function CafePage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("cafe.orders.read") === false) {
    redirect("/");
  }

  let activeOrders: CafeOrderDto[] = [];
  let history: CafeOrderDto[] = [];
  try {
    activeOrders = user.permissions.has("cafe.kds.view")
      ? await listKdsOrders(user)
      : await listActiveCafeOrders(user);
    history = await listCafeOrderHistory(user, 20);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <CafeScreen
      initialActive={activeOrders}
      initialHistory={history}
      canCreate={user.permissions.has("cafe.orders.create")}
      canTransition={user.permissions.has("cafe.orders.status")}
      canCancel={user.permissions.has("cafe.orders.cancel")}
      hasKds={user.permissions.has("cafe.kds.view")}
    />
  );
}
