import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/sales/constants";

/**
 * Shared client/server validations for expenses and expense categories
 * (Phase 6). Server Actions re-validate everything server-side. Amounts,
 * category/shift references are NEVER trusted from the client — the service
 * resolves references and enforces financial rules.
 */

/* ---- Expense categories ---- */

export const expenseCategorySchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم الفئة").max(120, "اسم الفئة طويل جدًا"),
  active: z.boolean().optional(),
});

export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;

/* ---- Expenses ---- */

export const expenseSchema = z.object({
  categoryId: z.string().min(1, "اختر فئة المصروف"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  paymentMethod: z.enum(PAYMENT_METHODS, "طريقة الدفع غير صحيحة"),
  /** ISO date string; defaults to now on the server. */
  expenseDate: z.string().min(1, "أدخل التاريخ").optional(),
  /** Optional linked shift (used for cash reconciliation when cash paid). */
  shiftId: z.string().min(1, "اختر الوردية").optional(),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جدًا").optional(),
  /** Client-generated UUID preventing duplicate submission (idempotency). */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

/* ---- Expense list query ---- */

export const expenseListQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  categoryId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExpenseListQuery = z.infer<typeof expenseListQuerySchema>;
