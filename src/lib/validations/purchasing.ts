import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/sales/constants";

/**
 * Shared client/server validations for suppliers, purchases, receiving,
 * payments, and returns (Phase 3). Server Actions re-validate everything
 * server-side; all totals and balances are derived server-side — nothing is
 * trusted from the client.
 */

/* ---- Suppliers ---- */

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم المورد").max(200, "اسم المورد طويل جدًا"),
  company: z.string().trim().max(200, "اسم الشركة طويل جدًا").optional(),
  phone: z.string().trim().max(40, "رقم الهاتف طويل جدًا").optional(),
  email: z
    .string()
    .trim()
    .max(200, "البريد الإلكتروني طويل جدًا")
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "أدخل بريدًا إلكترونيًا صحيحًا",
    })
    .optional(),
  address: z.string().trim().max(300, "العنوان طويل جدًا").optional(),
  notes: z.string().trim().max(2000, "الملاحظات طويلة جدًا").optional(),
  paymentTerms: z.string().trim().max(120, "شروط الدفع طويلة جدًا").optional(),
  active: z.boolean().optional(),
});

export type SupplierInput = z.infer<typeof supplierSchema>;

/* ---- Purchases (create + receive) ---- */

const purchaseItemSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce.number().int("أدخل كمية صحيحة").positive("الكمية يجب أن تكون أكبر من صفر"),
  cost: z.coerce.number().min(0, "التكلفة يجب ألا تكون سالبة"),
  /** Optional batch/expiry info, only for expiry-tracked products. */
  batchCode: z.string().trim().max(120, "كود الدفعة طويل جدًا").optional(),
  expiryDate: z.string().optional(),
});

export const purchaseCreateSchema = z.object({
  supplierId: z.string().min(1, "اختر المورد"),
  invoiceNumber: z.string().trim().max(120, "رقم الفاتورة طويل جدًا").optional(),
  paymentTerms: z.string().trim().max(120, "شروط الدفع طويلة جدًا").optional(),
  /** Whether the purchase is fully paid immediately (cash purchase, BR-015). */
  paidImmediately: z.boolean().optional(),
  items: z.array(purchaseItemSchema).min(1, "أضف منتجًا واحدًا على الأقل"),
});

export type PurchaseCreateInput = z.infer<typeof purchaseCreateSchema>;

/** Receiving an accepted quantity for a previously created PENDING purchase. */
export const receivePurchaseSchema = z.object({
  purchaseId: z.string().min(1, "اختر المشتريات"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "اختر المنتج"),
        acceptedQuantity: z.coerce
          .number()
          .int("أدخل كمية صحيحة")
          .min(0, "الكمية المقبولة يجب ألا تكون سالبة"),
        rejectedQuantity: z.coerce
          .number()
          .int("أدخل كمية صحيحة")
          .min(0, "الكمية المرفوضة يجب ألا تكون سالبة"),
      }),
    )
    .min(1, "أضف منتجًا واحدًا على الأقل"),
});

export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;

/* ---- Supplier payments ---- */

export const supplierPaymentSchema = z.object({
  supplierId: z.string().min(1, "اختر المورد"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  /**
   * Validated against the shared closed payment-method enum so supplier payments
   * aggregate consistently with sales / expenses / customer payments (a free-form
   * Arabic string would not match the `isCashMethod`/method grouping used across
   * accounting and shift reconciliation).
   */
  method: z.enum(PAYMENT_METHODS, "طريقة الدفع غير صحيحة"),
  /** Client-generated UUID preventing duplicate submission (idempotency). */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
});

export type SupplierPaymentInput = z.infer<typeof supplierPaymentSchema>;

/* ---- Supplier returns ---- */

export const supplierReturnSchema = z.object({
  supplierId: z.string().min(1, "اختر المورد"),
  purchaseId: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1, "اختر المنتج"),
        quantity: z.coerce.number().int("أدخل كمية صحيحة").positive("الكمية يجب أن تكون أكبر من صفر"),
        cost: z.coerce.number().min(0, "التكلفة يجب ألا تكون سالبة"),
        reason: z.string().trim().max(500, "السبب طويل جدًا").optional(),
      }),
    )
    .min(1, "أضف منتجًا واحدًا على الأقل"),
});

export type SupplierReturnInput = z.infer<typeof supplierReturnSchema>;
