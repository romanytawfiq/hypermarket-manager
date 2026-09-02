"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { kashierRedirectStatusAction } from "@/actions/online-store-actions";
import { useCartStore } from "@/store/cart";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Kashier merchant redirect return page (Phase 9.2).
 *
 * The customer is returned here by the Kashier hosted payment page. This page is
 * UX only: it reports the payment status and links to order tracking. It never
 * marks the order paid — the authoritative capture is the verified Kashier
 * server webhook (the order flips to PAID_ONLINE shortly after).
 */
export default function PaymentReturnPage() {
  const [state, setState] = useState<
    "loading" | "success" | "pending" | "failed"
  >("loading");
  const [tracking, setTracking] = useState<{ orderNumber: string; token: string } | null>(null);
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    let active = true;
    (async () => {
      // Recover the tracking secret stored before redirect to Kashier.
      let pending: { orderNumber: string; token: string } | null = null;
      try {
        const raw = sessionStorage.getItem("nexa-pending-online");
        if (raw) pending = JSON.parse(raw) as { orderNumber: string; token: string };
      } catch {
        pending = null;
      }
      if (active) setTracking(pending);

      const search = window.location.search;
      const { signatureValid, paymentStatus } = await kashierRedirectStatusAction(search);
      if (!active) return;

      if (!signatureValid) {
        setState("failed");
        return;
      }

      const status = String(paymentStatus ?? "").toUpperCase();
      if (status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL" || status === "CAPTURED") {
        setState("success");
        clear();
        try {
          sessionStorage.removeItem("nexa-pending-online");
        } catch {
          /* ignore */
        }
      } else if (status === "UNPAID" || status === "FAILED" || status === "DECLINED") {
        setState("failed");
      } else {
        setState("pending");
      }
    })();
    return () => {
      active = false;
    };
  }, [clear]);

  const trackHref =
    tracking?.orderNumber && tracking?.token
      ? `/store/track?orderNumber=${encodeURIComponent(tracking.orderNumber)}&token=${encodeURIComponent(tracking.token)}`
      : "/store/track";

  return (
    <div className="mx-auto max-w-md space-y-4 py-10 text-center">
      {state === "loading" ? (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2Icon className="size-6 animate-spin" aria-hidden />
          <p className="text-sm">جارٍ تأكيد حالة الدفع…</p>
        </div>
      ) : null}

      {state === "success" ? (
        <div className="space-y-3">
          <h1 className="font-heading text-xl font-bold text-green-700">تم الدفع بنجاح</h1>
          <p className="text-sm text-muted-foreground">
            تم تأكيد الدفع الإلكتروني. سيتم تجهيز طلبك وتوصيله.
          </p>
          <Link href={trackHref} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            متابعة الطلب
          </Link>
        </div>
      ) : null}

      {state === "pending" ? (
        <div className="space-y-3">
          <h1 className="font-heading text-xl font-bold">الدفع قيد المعالجة</h1>
          <p className="text-sm text-muted-foreground">
            تم استلام طلب الدفع وسيتم تأكيده خلال لحظات. تابع حالتك من صفحة التتبع.
          </p>
          <Link href={trackHref} className={cn(buttonVariants({ size: "lg" }), "w-full")}>
            متابعة الطلب
          </Link>
        </div>
      ) : null}

      {state === "failed" ? (
        <div className="space-y-3">
          <h1 className="font-heading text-xl font-bold text-destructive">لم يكتمل الدفع</h1>
          <p className="text-sm text-muted-foreground">
            لم يتم تأكيد الدفع. يمكنك المحاولة مرة أخرى أو استخدام الدفع عند الاستلام.
          </p>
          <div className="flex flex-col gap-2">
            <Link href="/store/cart" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              العودة إلى السلة
            </Link>
            {tracking?.orderNumber ? (
              <Link href={trackHref} className={cn(buttonVariants({ variant: "ghost" }), "w-full")}>
                عرض الطلب
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
