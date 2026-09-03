import { z } from "zod";
import mongoose from "mongoose";
import { AppError } from "@/lib/errors";

/**
 * Shared Zod field schemas and validation helpers used across the domain
 * validators (Phase 12 clean-code pass).
 *
 * These capture the small, repeated field definitions (idempotency keys,
 * positive quantities, pagination, entity ids, Arabic contact fields) and the
 * `safeParse → AppError(VALIDATION)` conversion so they are defined once
 * instead of being re-typed in every validator / service.
 */

/** Client-generated UUID-like key (duplicate-submission guard). */
export const IDEMPOTENCY_KEY = z
  .string()
  .trim()
  .min(8, "مفتاح غير صالح")
  .max(80, "مفتاح غير صالح");

/** A positive whole quantity (products, order lines, movements). */
export const POSITIVE_QUANTITY = z.coerce
  .number()
  .int("أدخل كمية صحيحة")
  .positive("الكمية يجب أن تكون أكبر من صفر");

/** A non-negative money amount. */
export const NON_NEGATIVE_MONEY = z.coerce.number().min(0, "المبلغ يجب ألا يكون سالبًا");

/** A positive money amount. */
export const POSITIVE_MONEY = z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر");

/** A non-empty entity ObjectId (product/customer/supplier/category/…). */
export const ENTITY_ID = z.string().min(1, "اختر العنصر");

/** Free contact fields shared by customers and suppliers. */
export const CONTACT_FIELDS = {
  phone: z.string().trim().min(1, "أدخل رقم الهاتف"),
  email: z
    .string()
    .trim()
    .email("أدخل بريدًا إلكترونيًا صحيحًا")
    .or(z.literal(""))
    .optional(),
  address: z.string().trim().max(500, "العنوان طويل جدًا").optional(),
  notes: z.string().trim().max(1000, "الملاحظات طويلة جدًا").optional(),
};

/** Pagination: `{ page, pageSize }` with safe defaults. */
export const PAGINATION = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
};

/**
 * Parses unknown input with a Zod schema and converts the first validation
 * issue into an `AppError(VALIDATION)`. Centralizes the repeated
 * `safeParse → AppError` conversion found across services and actions.
 */
export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError("VALIDATION", result.error.issues[0]?.message ?? "بيانات غير صحيحة");
  }
  return result.data;
}

/**
 * Server-Action variant: returns `{ ok: true, data }` or `{ ok: false, error }`
 * so actions can render the first Zod issue as a user-facing Arabic message
 * instead of throwing. Centralizes the private `parse()` helper that was
 * copy-pasted into many action files.
 */
export function parseActionResult<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  return { ok: true, data: result.data };
}

/**
 * Rejects a string that is not a valid MongoDB ObjectId by throwing
 * `AppError(NOT_FOUND, message)`. Centralizes the `mongoose.isValidObjectId`
 * guard duplicated across ID-based readers (and maps an invalid id to not-found
 * rather than a crash, preventing IDOR/type errors).
 */
export function assertValidObjectId(id: string, message: string): void {
  if (!mongoose.isValidObjectId(id)) {
    throw new AppError("NOT_FOUND", message);
  }
}
