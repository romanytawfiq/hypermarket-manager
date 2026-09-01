import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/sales/constants";
import { CAFE_SUGAR_LEVELS } from "@/lib/cafe/sugar";

/**
 * Café order validations (Phase 7 + 7.1).
 *
 * Server Actions re-validate everything server-side; the server recomputes all
 * prices/totals from the authoritative Product catalog and never trusts
 * client-supplied prices. Product ids, quantities, sugar selection, and payment
 * methods are the only user intent. Payments are enforced as full payment at
 * the register (checkout flow); the server rejects shortfalls.
 */

export const cafeOrderItemInputSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .positive("الكمية يجب أن تكون أكبر من صفر"),
  /** Structured per-cup sugar level. Only valid for products that support sugar options. */
  sugarLevel: z.enum(CAFE_SUGAR_LEVELS, "درجة السكر غير صحيحة").optional(),
  /** Per-line customization note (sugar is structured; notes remain free-text additions). */
  notes: z.string().trim().max(200, "الملاحظة طويلة جدًا").optional(),
});

const cafePaymentInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS, "طريقة الدفع غير صحيحة"),
  amount: z.coerce.number().min(0, "المبلغ يجب ألا يكون سالبًا"),
});

export const cafeOrderCreateSchema = z.object({
  items: z.array(cafeOrderItemInputSchema).min(1, "أضف صنفًا واحدًا على الأقل"),
  /**
   * Payments collected at the register when the order is placed. The server
   * requires the sum to equal the order total (full payment; no on-account
   * café orders in this phase). Mixed methods are supported; only CASH
   * affects the shift's expected cash.
   */
  payments: z.array(cafePaymentInputSchema).min(1, "أضف طريقة دفع واحدة على الأقل"),
  /** Client-generated idempotency key preventing duplicate submission. */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
  /** Optional order-level note, e.g. "حليب إضافي". */
  note: z.string().trim().max(500, "الملاحظة طويلة جدًا").optional(),
  /** Optional linked customer (the linked Sale carries the financial snapshot). */
  customerId: z.string().trim().min(1, "اختر العميل").optional(),
  /** Cash tendered (for change calculation) when a cash payment is present. */
  cashTendered: z.coerce.number().min(0, "المبلغ المدفوع نقدًا يجب ألا يكون سالبًا").optional(),
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
