import { z } from "zod";

/**
 * Online store & delivery validations (Phase 9).
 *
 * The server is the source of truth: product ids and quantities are the only
 * user intent. Prices, totals, delivery fees, reservation quantities, and COD
 * amounts are computed/validated server-side and never trusted from the client.
 * Client-side schemas mirror these for UX; Server Actions re-validate with the
 * identical schemas before reaching the service boundary.
 */

/** One cart line submitted at checkout (product id + quantity only). */
export const checkoutItemSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .positive("الكمية يجب أن تكون أكبر من صفر"),
  // Reject client-supplied price/total lines: prices are never trusted.
  unitPrice: z.undefined().optional(),
  lineTotal: z.undefined().optional(),
});

export const deliveryAddressSchema = z.object({
  fullName: z.string().trim().min(2, "أدخل الاسم الكامل").max(100, "الاسم طويل جدًا"),
  phone: z.string().trim().min(7, "رقم الهاتف غير صحيح").max(15, "رقم الهاتف غير صحيح"),
  city: z.string().trim().min(2, "أدخل المدينة").max(60, "المدينة طويلة جدًا"),
  area: z.string().trim().min(2, "أدخل المنطقة").max(60, "المنطقة طويلة جدًا"),
  street: z.string().trim().min(2, "أدخل الشارع").max(120, "الشارع طويل جدًا"),
  landmark: z.string().trim().max(120, "المعلم طويل جدًا").optional(),
  notes: z.string().trim().max(500, "الملاحظة طويلة جدًا").optional(),
});

/**
 * Checkout payload: the guest's contact/shipping details plus the cart lines.
 * The server recomputes every price, verifies availability against *active*
 * reservations, and holds the inventory via reservations in one transaction.
 */
export const onlineCheckoutSchema = z.object({
  customerName: z.string().trim().min(2, "أدخل الاسم الكامل").max(100, "الاسم طويل جدًا"),
  customerEmail: z.string().trim().email("البريد الإلكتروني غير صحيح").optional().or(z.literal("")),
  customerPhone: z.string().trim().min(7, "رقم الهاتف غير صحيح").max(15, "رقم الهاتف غير صحيح"),
  deliveryAddress: deliveryAddressSchema,
  items: z.array(checkoutItemSchema).min(1, "أضف صنفًا واحدًا على الأقل"),
  /**
   * Payment method: "COD" (default) or "ONLINE" (Kashier). The server re-validates
   * that online payment is configured and enabled before creating a session.
   */
  paymentMethod: z.enum(["COD", "ONLINE"]).optional(),
  /** Client-generated idempotency key preventing duplicate submission. */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
});
export type OnlineCheckoutInput = z.infer<typeof onlineCheckoutSchema>;

/** Guest order tracking by order number + token (read-only, no credentials). */
export const onlineTrackOrderSchema = z.object({
  orderNumber: z.string().trim().min(3, "أدخل رقم الطلب").max(40, "رقم الطلب غير صحيح"),
  trackingToken: z.string().trim().min(8, "رمز التتبع غير صحيح").max(80, "رمز التتبع غير صحيح"),
});
export type OnlineTrackOrderInput = z.infer<typeof onlineTrackOrderSchema>;

/** Delivery employee transition (delivery workflow only). */
export const onlineTransitionSchema = z.object({
  orderId: z.string().min(1, "معرّف الطلب مطلوب"),
  targetStatus: z.enum(
    [
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "READY_FOR_DELIVERY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ],
    "حالة غير صحيحة",
  ),
  /** Mark COD collected (posts the linked Sale) when transitioning to DELIVERED. */
  collectCod: z.boolean().optional(),
});
export type OnlineTransitionInput = z.infer<typeof onlineTransitionSchema>;

/** Assign/clear the delivery employee for an order (management). */
export const onlineAssignSchema = z.object({
  orderId: z.string().min(1, "معرّف الطلب مطلوب"),
  employeeId: z
    .string()
    .trim()
    .min(1, "اختر مندوب التوصيل")
    .optional()
    .nullable(),
  employeeUsername: z.string().trim().optional().nullable(),
});
export type OnlineAssignInput = z.infer<typeof onlineAssignSchema>;