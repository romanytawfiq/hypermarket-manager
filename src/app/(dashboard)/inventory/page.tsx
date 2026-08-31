import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listProductStockSummary, getExpirySummary } from "@/services/inventory.service";
import { AppError } from "@/lib/errors";
import { InventoryManager } from "@/components/inventory/inventory-manager";

export const metadata: Metadata = {
  title: "المخزون — نكسا ريتيل",
};

export default async function InventoryPage() {
  const user = (await getCurrentUser())!;

  let rows;
  let expirySummary;
  try {
    const [r, e] = await Promise.all([listProductStockSummary(user), getExpirySummary(user)]);
    rows = r;
    expirySummary = e;
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <InventoryManager
      rows={rows}
      expirySummary={expirySummary}
      canAdjust={user.permissions.has("inventory.adjust")}
      canCount={user.permissions.has("inventory.count")}
    />
  );
}
