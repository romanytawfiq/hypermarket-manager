import { z } from "zod";

/**
 * Café order validations (Phase 7).
 *
 * Server Actions re-validate everything server-side; the server recomputes all
 * prices/totals from the authoritative Product catalog and never trusts
 * client-supplied prices. Quantities and product ids are the only user intent.
 */

export const cafeOrderItemInputSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .positive("الكمية يجب أن تكون أكبر من صفر"),
  /** Simple per-line note (no modifiers system in Phase 7). */
  notes: z.string().trim().max(200, "الملاحظة طويلة جدًا").optional(),
});

export const cafeOrderCreateSchema = z.object({
  items: z.array(cafeOrderItemInputSchema).min(1, "أضف صنفًا واحدًا على الأقل"),
  /** Client-generated idempotency key preventing duplicate submission. */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
  /** Optional order-level note, e.g. "بدون سكر" / "حليب إضافي". */
  note: z.string().trim().max(500, "الملاحظة طويلة جدًا").optional(),
  /** Optional customer association (no financial posting in Phase 7). */
  customerId: z.string().trim().min(1, "اختر العميل").optional(),
});

export type CafeOrderCreateInput = z.infer<typeof cafeOrderCreateSchema>;

export const cafeTransitionSchema = z.object({
  orderId: z.string().min(1, "معرّف الطلب مطلوب"),
  targetStatus: z.enum(
    ["NEW", "PREPARING", "READY", "COMPLETED", "CANCELLED"],
    "حالة غير صحيحة",
  ),
});

export type CafeTransitionInput = z.infer<typeof cafeTransitionSchema>;
