import { z } from "zod";

/**
 * Shared client/server validations for inventory operations (Phase 2).
 * All quantities are server-validated; nothing is trusted from the client.
 */

/** Adjustment applies a signed quantity delta to the product's sellable stock. */
export const adjustStockSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  /** Signed delta: positive adds stock, negative removes it. */
  quantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .refine((v) => v !== 0, { message: "الكمية يجب ألا تكون صفرًا" }),
  reason: z.string().trim().min(1, "أدخل سبب التعديل").max(300, "السبب طويل جدًا"),
});

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

/** Stock count: recorded physical quantity; reconciliation derives the delta. */
export const stockCountSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  countedQuantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .min(0, "الكمية يجب ألا تكون سالبة"),
  note: z.string().trim().max(300, "الملاحظة طويلة جدًا").optional(),
});

export type StockCountInput = z.infer<typeof stockCountSchema>;

/** Damage write-off: positive quantity moved out of sellable stock. */
export const damageSchema = z.object({
  productId: z.string().min(1, "اختر المنتج"),
  quantity: z.coerce
    .number()
    .int("أدخل كمية صحيحة")
    .positive("الكمية يجب أن تكون أكبر من صفر"),
  reason: z.string().trim().min(1, "أدخل سبب التلف").max(300, "السبب طويل جدًا"),
});

export type DamageInput = z.infer<typeof damageSchema>;

/** Expiry disposal: positive quantity of expired batch to write off. */
export const disposeExpiredSchema = z.object({
  batchId: z.string().min(1, "اختر الدفعة"),
});

export type DisposeExpiredInput = z.infer<typeof disposeExpiredSchema>;

/** Movement history query filters (server-side pagination). */
export const movementQuerySchema = z.object({
  productId: z.string().optional(),
  type: z
    .enum([
      "PURCHASE",
      "SALE",
      "CUSTOMER_RETURN",
      "SUPPLIER_RETURN",
      "DAMAGE",
      "EXPIRY",
      "ADJUSTMENT",
      "STOCK_COUNT",
      "TRANSFER",
    ])
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(20),
});

export type MovementQuery = z.infer<typeof movementQuerySchema>;
