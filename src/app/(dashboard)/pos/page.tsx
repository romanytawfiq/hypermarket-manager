import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getActiveShiftAction } from "@/actions/shift-actions";
import type { ShiftDto } from "@/services/shift.service";
import { PosScreen } from "@/components/pos/pos-screen";

export const metadata: Metadata = {
  title: "نقطة البيع — نكسا ريتيل",
};

export default async function PosPage() {
  const user = (await getCurrentUser())!;

  if (user.permissions.has("sales.create") === false) {
    redirect("/");
  }

  let activeShift: ShiftDto | null = null;
  try {
    activeShift = await getActiveShiftAction();
  } catch {
    activeShift = null;
  }

  return (
    <PosScreen
      activeShift={activeShift}
      hasShiftsRead={user.permissions.has("shifts.read")}
      hasReceiptsPrint={user.permissions.has("receipts.print")}
    />
  );
}
