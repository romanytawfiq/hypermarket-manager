import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getAccountingOverview } from "@/services/accounting.service";
import { AppError } from "@/lib/errors";
import { AccountingOverview } from "@/components/accounting/accounting-overview";

export const metadata: Metadata = {
  title: "المحاسبة — نظرة عامة",
};

export default async function AccountingPage() {
  const user = (await getCurrentUser())!;

  let overview;
  try {
    overview = await getAccountingOverview(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return <AccountingOverview initial={overview} canViewExpenses={user.permissions.has("expenses.read")} />;
}
