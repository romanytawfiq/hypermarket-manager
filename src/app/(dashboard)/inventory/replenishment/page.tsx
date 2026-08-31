import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getReplenishmentSuggestions } from "@/services/inventory.service";
import { AppError } from "@/lib/errors";
import { ReplenishmentView } from "@/components/inventory/replenishment-view";

export const metadata: Metadata = {
  title: "إعادة التخزين — نكسا ريتيل",
};

export default async function ReplenishmentPage() {
  const user = (await getCurrentUser())!;

  let rows;
  try {
    rows = await getReplenishmentSuggestions(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return <ReplenishmentView rows={rows} />;
}
