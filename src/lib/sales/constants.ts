/**
 * Shared POS / payments constants (Phase 4).
 *
 * Payment methods are defined once here and reused by models, validations, and
 * the UI. The financial model records each method explicitly; mixed payments
 * are supported (BR-008) and non-cash methods never count as physical cash in
 * shift reconciliation (BR-001, §28 expected-cash formula).
 */

export const PAYMENT_METHODS = [
  "CASH",
  "VISA",
  "MASTERCARD",
  "INSTAPAY",
  "VODAFONE_CASH",
  "ONLINE",
  "OTHER",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Arabic label for each payment method. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "نقدي",
  VISA: "فيزا",
  MASTERCARD: "ماستركارد",
  INSTAPAY: "إنستا باي",
  VODAFONE_CASH: "فودافون كاش",
  ONLINE: "دفع إلكتروني",
  OTHER: "أخرى",
};

/** True for physical cash (only cash counts toward the till expected cash). */
export function isCashMethod(method: PaymentMethod): boolean {
  return method === "CASH";
}

/** Returns the Arabic label for a payment method, with a safe fallback. */
export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? "أخرى";
}
