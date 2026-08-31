import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { ShiftsManager } from "@/components/pos/shifts-manager";

export const metadata: Metadata = {
  title: "الورديات — نكسا ريتيل",
};

export default async function ShiftsPage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("shifts.read") === false) {
    redirect("/");
  }

  return <ShiftsManager />;
}
