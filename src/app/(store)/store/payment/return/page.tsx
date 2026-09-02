"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2Icon } from "lucide-react";
import { kashierRedirectStatusAction, trackOnlineOrderAction } from "@/actions/online-store-actions";
import { useCartStore } from "@/store/cart";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Kashier merchant redirect return page (Phase 9.2).
 *
 * The customer is returned here by the Kashier hosted payment page. This page is
 * UX only and NEVER marks the order paid — the authoritative capture is the
 * verified Kashier server webhook, which flips the order's `paymentState` to
 * `PAID_ONLINE` in MongoDB. We therefore QUERY the server for the order's real
 * status (via the tracking secret kept from checkout) instead of trusting the
 * redirect alone. The redirect signature is cross-checked as defense-in-depth but
 * is not the source of truth.
 */
export default function PaymentReturnPage() {
  const [state, setState] = useState<
    "loading" | "success" | "pending" | "failed"
  >("loading");
  const [tracking, setTracking] = useState<{ orderNumber: string; token: string } | null>(null);
  const clear = useCartStore((s) => s.clear);

  useEffect(() => {
    let active = true;

    // Recover the tracking secret stored before redirect to Kashier.
    let pending: { orderNumber: string; token: string } | null = null;
    try {
      const raw = sessionStorage.getItem("nexa-pending-online");
      if (raw) pending = JSON.parse(raw) as { orderNumber: string; token: string };
    } catch {
      pending = null;
    }

    (async () => {
      const search = window.location.search;

      // 1) Cross-check the redirect signature (defense-in-depth, cosmetic).
      const { signatureValid } = await kashierRedirectStatusAction(search);

      if (active) setTracking(pending);

      // 2) Query the server for the authoritative order payment status.
      let serverPaid = false;
      if (pending?.orderNumber && pending?.token) {
        const res = await trackOnlineOrderAction({
          orderNumber: pending.orderNumber,
          trackingToken: pending.token,
        });
        if (res.order) {
          serverPaid =
            res.order.paymentState === "PAID_ONLINE" && res.order.paymentCollected === true;
        }
      }

      if (!active) return;

      if (serverPaid) {
        setState("success");
        clear();
        try {
          sessionStorage.removeItem("nexa-pending-online");
        } catch {
          /* ignore */
        }
        return;
      }

      // No tracking secret to reconcile — degrade to the redirect signature only.
      if (!pending?.orderNumber && signatureValid) {
        const { paymentStatus } = await kashierRedirectStatusAction(search);
        const status = String(paymentStatus ?? "").toUpperCase();
        if (status === "PAID" || status === "SUCCESS" || status === "SUCCESSFUL" || status === "CAPTURED") {
          setState("success");
          clear();
          try {
            sessionStorage.removeItem("nexa-pending-online");
          } catch {
            /* ignore */
          }
          return;
        }
      }

      // Order not yet confirmed paid by the webhook. Conservative "pending":
      // the payment is still processing server-side, and we never show a false
      // success on this UX-only page.
      setState("pending");
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
