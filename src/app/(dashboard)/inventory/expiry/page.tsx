import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getExpiryBatches } from "@/services/inventory.service";
import { AppError } from "@/lib/errors";
import { ExpiryView } from "@/components/inventory/expiry-view";

export const metadata: Metadata = {
  title: "انتهاء الصلاحية — نكسا ريتيل",
};

export default async function ExpiryPage() {
  const user = (await getCurrentUser())!;

  let batches;
  try {
    batches = await getExpiryBatches(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return <ExpiryView batches={batches} canDispose={user.permissions.has("inventory.adjust")} />;
}
