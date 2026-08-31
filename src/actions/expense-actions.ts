"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  expenseCategorySchema,
  expenseSchema,
  type ExpenseCategoryInput,
  type ExpenseInput,
} from "@/lib/validations/expenses";
import {
  listExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  setExpenseCategoryActive,
  createExpense,
  listExpenses,
  getExpense,
  type ExpenseCategoryDto,
  type ExpenseDto,
} from "@/services/expense.service";
import { resolveError } from "@/lib/errors";

/**
 * Expense Server Actions (Phase 6).
 * Authorization runs in the service; input is re-validated server-side.
 */

export interface ExpenseActionState {
  error?: string;
  success?: boolean;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  return { ok: true, data: result.data };
}

/* ---- Expense categories ---- */

export async function createExpenseCategoryAction(input: ExpenseCategoryInput): Promise<ExpenseActionState> {
  const p = parse(expenseCategorySchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createExpenseCategory(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/expenses");
  revalidatePath("/accounting");
  return { success: true };
}

export async function updateExpenseCategoryAction(id: string, input: ExpenseCategoryInput): Promise<ExpenseActionState> {
  const p = parse(expenseCategorySchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await updateExpenseCategory(await getCurrentUser(), id, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/expenses");
  return { success: true };
}

export async function setExpenseCategoryActiveAction(id: string, active: boolean): Promise<ExpenseActionState> {
  try {
    await setExpenseCategoryActive(await getCurrentUser(), id, active);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/expenses");
  return { success: true };
}

/** Lists categories for the category selector / management UI. */
export async function listExpenseCategoriesAction(activeOnly = false): Promise<ExpenseCategoryDto[]> {
  try {
    return await listExpenseCategories(await getCurrentUser(), { activeOnly });
  } catch {
    return [];
  }
}

/* ---- Expenses ---- */

export async function createExpenseAction(input: ExpenseInput): Promise<ExpenseActionState> {
  const p = parse(expenseSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createExpense(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/expenses");
  revalidatePath("/accounting");
  revalidatePath("/shifts");
  return { success: true };
}

/** Lists expenses for the expenses page (filters + pagination). */
export async function listExpensesAction(query?: {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: ExpenseDto[]; total: number; page: number; pageSize: number }> {
  try {
    return await listExpenses(await getCurrentUser(), query ?? {});
  } catch {
    return { items: [], total: 0, page: query?.page ?? 1, pageSize: query?.pageSize ?? 20 };
  }
}

/** Fetches a single expense by id. */
export async function getExpenseAction(id: string): Promise<ExpenseDto | null> {
  try {
    return await getExpense(await getCurrentUser(), id);
  } catch {
    return null;
  }
}
