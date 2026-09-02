import type {
  OnlineOrderStatus,
  OnlinePaymentState,
  OnlineOrderPaymentMethod,
} from "@/models/online-order";

/**
 * Arabic labels for online-order concepts (Phase 9).
 *
 * Kept in a dependency-free module (no mongoose) so client components can import
 * it without pulling the server-only service/bundle into the browser.
 */
export function onlineOrderStatusLabel(status: OnlineOrderStatus): string {
  return (
    {
      PENDING: "قيد المراجعة",
      CONFIRMED: "مؤكد",
      PREPARING: "تجهيز الطلب",
      READY_FOR_DELIVERY: "جاهز للتوصيل",
      OUT_FOR_DELIVERY: "خارج للتوصيل",
      DELIVERED: "تم التسليم",
      CANCELLED: "ملغي",
    } as Record<OnlineOrderStatus, string>
  )[status];
}

/** Arabic label for the online-order payment state. */
export function onlinePaymentStateLabel(state: OnlinePaymentState): string {
  return (
    {
      PAYMENT_PENDING: "دون دفع",
      PAID_ONLINE: "مدفوع إلكترونيًا",
      PAID_AT_DELIVERY: "مدفوع عند الاستلام",
    } as Record<OnlinePaymentState, string>
  )[state];
}

/** Arabic label for the online-order payment method. */
export function onlinePaymentMethodLabel(method: OnlineOrderPaymentMethod): string {
  return method === "ONLINE" ? "إلكتروني" : "عند الاستلام";
}