import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SalesHistory } from "@/components/pos/sales-history";

export const metadata: Metadata = {
  title: "المبيعات — نكسا ريتيل",
};

export default async function SalesPage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("sales.read") === false) {
    redirect("/");
  }

  return <SalesHistory />;
}
