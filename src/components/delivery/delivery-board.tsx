"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, TruckIcon, PackageCheckIcon } from "lucide-react";
import {
  listDeliveryOrdersAction,
  transitionOnlineOrderAction,
  collectCodAndDeliverAction,
  deliverPaidOnlineOrderAction,
} from "@/actions/online-store-actions";
import type { OnlineOrderDto } from "@/services/online-store.service";
import { onlineOrderStatusLabel } from "@/lib/online-store/labels";
import { Button } from "@/components/ui/button";
import { formatEgp, formatDateTime } from "@/lib/format";

type ActionTarget = "out" | "deliver";

/**
 * Delivery employee board (Phase 9). Shows the orders the current delivery
 * employee can fulfill (assigned + ready) and provides the two key actions:
 * mark OUT_FOR_DELIVERY, and collect COD + DELIVER. All server-authoritative.
 */
export function DeliveryBoard({
  initial,
  canCollect,
}: {
  initial: OnlineOrderDto[];
  canCollect: boolean;
}) {
  const [orders, setOrders] = useState(initial);
  const [busy, setBusy] = useState<Record<string, ActionTarget | "refresh" | null>>({});

  const startRef = (id: string, t: ActionTarget | "refresh") =>
    setBusy((p) => ({ ...p, [id]: t }));

  async function run(id: string, action: ActionTarget) {
    if (busy[id]) return;
    const order = orders.find((o) => o.id === id);
    if (!order) return;
    startRef(id, action);
    try {
      if (action === "out") {
        const res = await transitionOnlineOrderAction({ orderId: id, targetStatus: "OUT_FOR_DELIVERY" });
        if (res.order) {
          toast.success("تم تعليم الطلب كخارج للتوصيل");
          setOrders((prev) => prev.map((o) => (o.id === id ? res.order! : o)));
        } else {
          toast.error(res.error ?? "تعذّر تحديث الحالة");
        }
      } else {
        // Online-paid orders are delivered by posting the non-cash ONLINE Sale;
        // COD orders are delivered by collecting the cash.
        const res =
          order.paymentMethod === "ONLINE"
            ? await deliverPaidOnlineOrderAction(id)
            : await collectCodAndDeliverAction(id);
        if (res.order) {
          toast.success(
            order.paymentMethod === "ONLINE"
              ? "تم تسليم الطلب وتسجيل مبيعه الإلكتروني"
              : "تم تسليم الطلب وتحصيل الدفع عند الاستلام",
          );
          setOrders((prev) => prev.map((o) => (o.id === id ? res.order! : o)));
        } else {
          toast.error(res.error ?? "تعذّر إتمام التسليم. تأكد من فتح وردية لتسجيل البيع");
        }
      }
    } finally {
      setBusy((p) => ({ ...p, [id]: null }));
    }
  }

  async function refresh() {
    const list = await listDeliveryOrdersAction();
    setOrders(list);
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/40 p-8 text-center text-sm text-muted-foreground">
        لا توجد طلبات للتوصيل حاليًا.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={refresh} disabled={busy.refresh === "refresh"}>
          {busy.refresh === "refresh" ? <Loader2Icon className="size-4 animate-spin" /> : null}
          تحديث
        </Button>
      </div>
      <ul className="space-y-3">
        {orders.map((order) => {
          const b = busy[order.id];
          const canOut = order.status === "READY_FOR_DELIVERY";
          // COD is delivered by collecting cash (not yet collected). An ONLINE
          // order is delivered once its payment has been captured (webhook).
          const canDeliver =
            order.status === "OUT_FOR_DELIVERY" &&
            (order.paymentMethod === "COD"
              ? !order.paymentCollected
              : order.paymentState === "PAID_ONLINE" && order.paymentCollected);
          return (
            <li key={order.id} className="rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold">{order.orderNumber}</span>
                  <span className="ms-2 text-xs text-muted-foreground">
                    {onlineOrderStatusLabel(order.status)}
                  </span>
                </div>
                <span className="text-lg font-bold text-primary">{formatEgp(order.payableAmount)}</span>
              </div>

              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p>العميل: {order.customerName} — <span dir="ltr">{order.customerPhone}</span></p>
                <p>
                  عنوان التوصيل: {String(order.deliveryAddress.city ?? "")}، {String(order.deliveryAddress.area ?? "")}،{" "}
                  {String(order.deliveryAddress.street ?? "")}
                </p>
                <ul className="mt-1 space-y-0.5 border-t pt-2">
                  {order.items.map((item, i) => (
                    <li key={i} className="flex justify-between gap-2">
                      <span>{item.productName} × {item.quantity}</span>
                      <span>{formatEgp(item.lineTotal)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <span className="me-auto text-xs text-muted-foreground">
                  {formatDateTime(order.createdAt)}
                </span>
                {canOut ? (
                  <Button size="sm" onClick={() => run(order.id, "out")} disabled={!!b}>
                    {b === "out" ? <Loader2Icon className="size-4 animate-spin" /> : <TruckIcon className="size-4" />}
                    خروج للتوصيل
                  </Button>
                ) : null}
                {canCollect && canDeliver ? (
                  <Button size="sm" onClick={() => run(order.id, "deliver")} disabled={!!b}>
                    {b === "deliver" ? <Loader2Icon className="size-4 animate-spin" /> : <PackageCheckIcon className="size-4" />}
                    {order.paymentMethod === "ONLINE" ? "تسليم الطلب" : "تسليم + تحصيل الدفع"}
                  </Button>
                ) : null}
                {order.paymentCollected && order.paymentMethod === "COD" ? (
                  <span className="text-xs font-medium text-green-700">تم الدفع عند الاستلام</span>
                ) : null}
                {order.paymentCollected && order.paymentMethod === "ONLINE" ? (
                  <span className="text-xs font-medium text-green-700">تم الدفع إلكترونيًا</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}