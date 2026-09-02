"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import {
  transitionOnlineOrderAction,
} from "@/actions/online-store-actions";
import type { OnlineOrderDto } from "@/services/online-store.service";
import {
  onlineOrderStatusLabel,
  onlinePaymentStateLabel,
  onlinePaymentMethodLabel,
} from "@/lib/online-store/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatEgp, formatDateTime } from "@/lib/format";

/**
 * Online order detail panel (Phase 9). Renders the persisted server snapshot and
 * drives status transitions (including cancel) through the validated state
 * machine. All fields come from the server DTO — never from the client.
 */
export function OrderDetailClient({
  order,
  canManage,
}: {
  order: OnlineOrderDto;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function commit(targetStatus: OnlineOrderDto["status"]) {
    startTransition(async () => {
      const res = await transitionOnlineOrderAction({
        orderId: order.id,
        targetStatus,
      });
      if (res.order) {
        toast.success("تم تحديث حالة الطلب");
        window.location.reload();
      } else {
        toast.error(res.error ?? "تعذّر تحديث حالة الطلب");
      }
    });
  }

  const active = order.status !== "DELIVERED" && order.status !== "CANCELLED";

  const STEPS: OnlineOrderDto["status"][] = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY_FOR_DELIVERY",
    "OUT_FOR_DELIVERY",
    "DELIVERED",
  ];
  const stepIdx = STEPS.indexOf(order.status);
  const canAdvance = active && stepIdx >= 0 && stepIdx < STEPS.length - 1;
  const canCancel = active && order.status !== "DELIVERED";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl font-bold">{order.orderNumber}</h1>
          <p className="text-sm text-muted-foreground">
            أُنشئ في {formatDateTime(order.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{onlineOrderStatusLabel(order.status)}</Badge>
          <Badge variant="secondary">
            {onlinePaymentMethodLabel(order.paymentMethod)} ·{" "}
            {onlinePaymentStateLabel(order.paymentState)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Customer */}
        <section className="rounded-lg border bg-background p-4 space-y-2">
          <h2 className="font-heading text-sm font-bold">معلومات العميل</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">الاسم</dt>
              <dd>{order.customerName}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">الهاتف</dt>
              <dd dir="ltr">{order.customerPhone}</dd>
            </div>
            {order.customerEmail ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">البريد</dt>
                <dd dir="ltr">{order.customerEmail}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {/* Delivery address */}
        <DeliveryAddressSection address={order.deliveryAddress} />

        {/* Payment */}
        <section className="rounded-lg border bg-background p-4 space-y-2">
          <h2 className="font-heading text-sm font-bold">الدفع</h2>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">طريقة الدفع</dt>
              <dd>{onlinePaymentMethodLabel(order.paymentMethod)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">الحالة</dt>
              <dd>{onlinePaymentStateLabel(order.paymentState)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">مبلغ الدفع</dt>
              <dd className="font-semibold">{formatEgp(order.payableAmount)}</dd>
            </div>
            {order.onlinePayment?.status ? (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">مرجع الدفع</dt>
                <dd dir="ltr">{order.onlinePayment.status}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      {/* Items */}
      <section className="rounded-lg border bg-background">
        <div className="border-b p-3">
          <h2 className="font-heading text-sm font-bold">المنتجات ({order.items.length})</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="px-3 py-2 text-start font-medium">المنتج</th>
              <th className="px-3 py-2 text-end font-medium">الكمية</th>
              <th className="px-3 py-2 text-end font-medium">سعر الوحدة</th>
              <th className="px-3 py-2 text-end font-medium">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="px-3 py-2">{item.productName}</td>
                <td className="px-3 py-2 text-end">{item.quantity}</td>
                <td className="px-3 py-2 text-end">{formatEgp(item.unitPrice)}</td>
                <td className="px-3 py-2 text-end font-medium">{formatEgp(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-1 border-t p-3 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">مجموع المنتجات</span>
            <span>{formatEgp(order.totalAmount)}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">رسوم التوصيل</span>
            <span>{formatEgp(order.deliveryFee)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-2 border-t pt-2">
            <span className="font-semibold">الإجمالي</span>
            <span className="text-lg font-bold text-primary">{formatEgp(order.payableAmount)}</span>
          </div>
        </div>
      </section>

      {/* Timelines / actions */}
      <section className="rounded-lg border bg-background p-4">
        <h2 className="font-heading text-sm font-bold">العمليات</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {canManage && canAdvance ? (
            <Button
              variant="outline"
              onClick={() => commit(STEPS[stepIdx + 1]!)}
              disabled={pending}
            >
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              تقدم إلى {onlineOrderStatusLabel(STEPS[stepIdx + 1]!)}
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              variant="destructive"
              onClick={() => commit("CANCELLED")}
              disabled={pending}
            >
              {pending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              إلغاء الطلب
            </Button>
          ) : null}
          {!canManage && active ? (
            <p className="text-sm text-muted-foreground">
              ليس لديك صلاحية تعديل حالة هذا الطلب.
            </p>
          ) : null}
        </div>
        {order.statusHistory.length > 0 ? (
          <ol className="mt-4 space-y-1.5 text-sm">
            {order.statusHistory.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span>
                  {onlineOrderStatusLabel(h.status)}
                  {h.by ? ` — ${h.by}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>

      <Link href="/online-orders" className="text-sm text-muted-foreground hover:text-foreground">
        ← العودة إلى الطلبات
      </Link>
    </div>
  );
}

/** Renders the persisted delivery address with a safe, typed read of the record. */
function DeliveryAddressSection({ address }: { address: Record<string, unknown> }) {
  const a = {
    fullName: typeof address.fullName === "string" ? address.fullName : "",
    city: typeof address.city === "string" ? address.city : "",
    area: typeof address.area === "string" ? address.area : "",
    street: typeof address.street === "string" ? address.street : "",
    landmark: typeof address.landmark === "string" ? address.landmark : "",
    notes: typeof address.notes === "string" ? address.notes : "",
  };
  return (
    <section className="rounded-lg border bg-background p-4 space-y-2">
      <h2 className="font-heading text-sm font-bold">عنوان التوصيل</h2>
      <p className="text-sm leading-relaxed">
        {a.fullName ? <span className="block">{a.fullName}</span> : null}
        <span className="block">
          {a.city}، {a.area}، {a.street}
        </span>
        {a.landmark ? (
          <span className="block text-muted-foreground">معلم: {a.landmark}</span>
        ) : null}
      </p>
      {a.notes ? (
        <p className="text-sm text-muted-foreground">ملاحظات: {a.notes}</p>
      ) : null}
    </section>
  );
}