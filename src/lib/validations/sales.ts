import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/sales/constants";

/**
 * Shared client/server validations for POS sales, payments, cashier shifts, and
 * cash movements (Phase 4). Server Actions re-validate everything server-side.
 * Totals are NEVER trusted from the client — the server recomputes amounts.
 */

/* ---- POS sale ---- */

const saleItemInputSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .positive("الكمية يجب أن تكون أكبر من صفر"),
});

const salePaymentInputSchema = z.object({
  method: z.enum(PAYMENT_METHODS, "طريقة الدفع غير صحيحة"),
  amount: z.coerce.number().min(0, "المبلغ يجب ألا يكون سالبًا"),
});

export const saleCreateSchema = z.object({
  items: z.array(saleItemInputSchema).min(1, "أضف منتجًا واحدًا على الأقل"),
  payments: z.array(salePaymentInputSchema).min(1, "أضف طريقة دفع واحدة على الأقل"),
  /** Client-generated UUID preventing duplicate submission (idempotency). */
  idempotencyKey: z.string().trim().min(8, "مفتاح غير صالح").max(80, "مفتاح غير صالح"),
  /** Optional customer snapshot (free-form in Phase 4). */
  customerName: z.string().trim().max(200, "اسم العميل طويل جدًا").optional(),
  /** Cash tendered (for change calculation) when a cash payment is present. */
  cashTendered: z.coerce.number().min(0, "المبلغ المدفوع نقدًا يجب ألا يكون سالبًا").optional(),
});

export type SaleCreateInput = z.infer<typeof saleCreateSchema>;

/* ---- Shift ---- */

export const shiftOpenSchema = z.object({
  openingCash: z.coerce.number().min(0, "المبلغ الافتتاحي يجب ألا يكون سالبًا"),
});

export type ShiftOpenInput = z.infer<typeof shiftOpenSchema>;

export const shiftCloseSchema = z.object({
  actualCash: z.coerce.number().min(0, "المبلغ الفعلي يجب ألا يكون سالبًا"),
  note: z.string().trim().max(500, "الملاحظة طويلة جدًا").optional(),
});

export type ShiftCloseInput = z.infer<typeof shiftCloseSchema>;

/* ---- Cash movement ---- */

export const CASH_MOVEMENT_VALUES = ["CASH_IN", "CASH_OUT", "EXPENSE", "ADJUSTMENT"] as const;

export const cashMovementSchema = z.object({
  type: z.enum(CASH_MOVEMENT_VALUES, "نوع الحركة غير صحيح"),
  amount: z.coerce.number().positive("المبلغ يجب أن يكون أكبر من صفر"),
  reason: z.string().trim().min(1, "أدخل سبب الحركة").max(500, "السبب طويل جدًا"),
});

export type CashMovementInput = z.infer<typeof cashMovementSchema>;
