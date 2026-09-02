"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { trackOnlineOrderAction } from "@/actions/online-store-actions";
import type { OnlineOrderDto } from "@/services/online-store.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatEgp, formatDateTime } from "@/lib/format";

function StatusBadge({ status }: { status: OnlineOrderDto["status"] }) {
  const label: Record<OnlineOrderDto["status"], string> = {
    PENDING: "قيد المراجعة",
    CONFIRMED: "مؤكد",
    PREPARING: "تجهيز الطلب",
    READY_FOR_DELIVERY: "جاهز للتوصيل",
    OUT_FOR_DELIVERY: "خارج للتوصيل",
    DELIVERED: "تم التسليم",
    CANCELLED: "ملغي",
  };
  const tone =
    status === "DELIVERED"
      ? "bg-green-100 text-green-800"
      : status === "CANCELLED"
        ? "bg-destructive/10 text-destructive"
        : "bg-primary/10 text-primary";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${tone}`}>
      {label[status]}
    </span>
  );
}

function TrackContent() {
  const params = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(params.get("orderNumber") ?? "");
  const [token, setToken] = useState(params.get("token") ?? "");
  const [order, setOrder] = useState<OnlineOrderDto | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const n = params.get("orderNumber");
    const t = params.get("token");
    if (n && t) {
      startTransition(async () => {
        const res = await trackOnlineOrderAction({ orderNumber: n, trackingToken: t });
        if (res.order) setOrder(res.order);
        else setError(res.error ?? "لم يتم العثور على الطلب");
      });
    }
  }, [params]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    setError(undefined);
    setOrder(null);
    startTransition(async () => {
      const res = await trackOnlineOrderAction({ orderNumber, trackingToken: token });
      if (res.order) setOrder(res.order);
      else setError(res.error ?? "لم يتم العثور على الطلب");
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">تتبع طلبك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدخل رقم الطلب ورمز التتبع الذي حصلت عليه عند تأكيد الطلب.
        </p>
      </div>

      <form onSubmit={search} className="space-y-3 rounded-lg border bg-background p-4" noValidate>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="orderNumber">رقم الطلب</Label>
            <Input id="orderNumber" dir="ltr" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="token">رمز التتبع</Label>
            <Input id="token" dir="ltr" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden /> : <SearchIcon className="size-4" aria-hidden />}
          تتبّع الطلب
        </Button>
      </form>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {order ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-background p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold">{order.orderNumber}</span>
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              أُنشئ في {formatDateTime(order.createdAt)}
            </p>
            {order.invoiceNumber ? (
              <p className="mt-1 text-xs text-muted-foreground">
                فاتورة: <span dir="ltr">{order.invoiceNumber}</span>
              </p>
            ) : null}

            <ul className="mt-4 space-y-1.5 border-t pt-3">
              {order.items.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span>{item.productName} × {item.quantity}</span>
                  <span className="font-medium">{formatEgp(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t pt-2">
              <span className="font-semibold">المبلغ المستحق عند الاستلام</span>
              <span className="text-lg font-bold text-primary">{formatEgp(order.payableAmount)}</span>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
            {order.status === "DELIVERED" ? (
              "تم تسليم طلبك بنجاح. شكرًا لتسوقك من متجر نكسا."
            ) : order.status === "CANCELLED" ? (
              "تم إلغاء هذا الطلب."
            ) : (
              <>
                احتفظ برقم الطلب <span dir="ltr" className="font-medium text-foreground">{order.orderNumber}</span> ورمز التتبع للاستعلام
                عن حالة طلبك لاحقًا.
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<p className="py-8 text-center text-sm text-muted-foreground">جارٍ تحميل التتبع…</p>}>
      <TrackContent />
    </Suspense>
  );
}