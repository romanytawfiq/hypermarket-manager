import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/sales/constants";

/**
 * Shared client/server validations for customers, credit sales, and customer
 * payments (Phase 5). Server Actions re-validate everything server-side.
 * Amounts, balances, and totals are NEVER trusted from the client — the server
 * recomputes them and enforces credit policy.
 */

/* ---- Customers ---- */

export const customerSchema = z.object({
  name: z.string().trim().min(1, "أدخل اسم العميل").max(200, "اسم العميل طويل جدًا"),
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
  /**
   * Per-customer credit cap; null = unlimited. Editing it affects only future
   * credit sales — it never rewrites historical balances (BR-002).
   */
  creditLimit: z
    .union([z.coerce.number().min(0, "حد الائتمان يجب ألا يكون سالبًا").max(1_000_000_000), z.null()])
    .nullable()
    .optional(),
  /** Whether the customer may purchase on credit. */
  allowCredit: z.boolean().optional(),
  active: z.boolean().optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;

/* ---- Credit sale (used by the POS sale action) ---- */

export const creditTermsSchema = z.object({
  /**
   * The customer this sale is linked to. When present with an amount paid
   * below the total, the remainder becomes a receivable (BR-012).
   */
  customerId: z.string().min(1, "اختر العميل").optional(),
  /**
   * Whether this is explicitly a credit/on-account sale. When true, the sale
   * may be partially or fully unpaid. Must be accompanied by `customerId`.
   */
  onCredit: z.boolean().optional(),
});

export type CreditTermsInput = z.infer<typeof creditTermsSchema>;

/* ---- Customer payments ---- */

export const customerPaymentSchema = z.object({
  customerId: z.string().min(1, "اختر العميل"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  method: z.enum(PAYMENT_METHODS, "طريقة الدفع غير صحيحة"),
  /** Client-generated UUID preventing duplicate submission (idempotency). */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
});

export type CustomerPaymentInput = z.infer<typeof customerPaymentSchema>;
