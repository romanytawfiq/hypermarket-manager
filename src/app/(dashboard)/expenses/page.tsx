import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listExpenses } from "@/services/expense.service";
import { listExpenseCategories } from "@/services/expense.service";
import { getActiveShift } from "@/services/shift.service";
import { AppError } from "@/lib/errors";
import { ExpensesManager } from "@/components/expenses/expenses-manager";

export const metadata: Metadata = {
  title: "المصروفات — المحاسبة",
};

export default async function ExpensesPage() {
  const user = (await getCurrentUser())!;

  let categories;
  let expenses;
  let openShiftId: string | null = null;
  try {
    categories = await listExpenseCategories(user);
    expenses = await listExpenses(user, { page: 1, pageSize: 25 });
    if (user.permissions.has("shifts.read")) {
      const active = await getActiveShift(user);
      openShiftId = active?.id ?? null;
    }
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <ExpensesManager
      initialExpenses={expenses.items}
      initialTotal={expenses.total}
      initialPage={expenses.page}
      pageSize={expenses.pageSize}
      categories={categories}
      openShiftId={openShiftId}
      canCreate={user.permissions.has("expenses.create")}
      canManageCategories={user.permissions.has("expense_categories.manage")}
      canViewAccounting={user.permissions.has("accounting.read")}
    />
  );
}
