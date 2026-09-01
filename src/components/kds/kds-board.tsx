"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2Icon, ChefHatIcon, CheckIcon, CookingPotIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { listKdsOrdersAction, transitionCafeOrderAction } from "@/actions/cafe-actions";
import { useCafeRealtime } from "@/lib/realtime/cafe-events";
import {
  CAFE_STATUS_LABELS,
  CAFE_STATUS_CARD_TONES,
  formatAge,
  formatShortTime,
} from "@/lib/cafe/format";
import { sugarLabel } from "@/lib/cafe/sugar";
import type { CafeOrderDto, CafeOrderStatusDto } from "@/services/cafe.service";

const COLUMNS: { status: CafeOrderStatusDto; title: string; hint: string }[] = [
  { status: "NEW", title: "جديد", hint: "طلبات بانتظار الاستلام" },
  { status: "PREPARING", title: "قيد التحضير", hint: "جارٍ التحضير" },
  { status: "READY", title: "جاهز", hint: "جاهز للتسليم" },
];

export function KdsBoard({
  initialOrders,
  canCancel,
}: {
  initialOrders: CafeOrderDto[];
  canCancel: boolean;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [now, setNow] = useState(() => Date.now());
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Tick every second so age timers stay live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function reload() {
    startTransition(async () => {
      const items = await listKdsOrdersAction();
      setOrders(items);
    });
  }

  const handlersRef = useRef({ onEvent: undefined as undefined | (() => void), onReconnect: undefined as undefined | (() => void) });
  useEffect(() => {
    handlersRef.current.onEvent = () => reload();
    handlersRef.current.onReconnect = () => {
      toast.info("تمت إعادة الاتصال — تحديث الطلبات");
      reload();
    };
  }, []);

  const realtime = useCafeRealtime(handlersRef);
  const connection = realtime.status;

  const advance = (orderId: string, status: CafeOrderStatusDto) => {
    setPendingOrderId(orderId);
    startTransition(async () => {
      const res = await transitionCafeOrderAction({ orderId, targetStatus: status });
      setPendingOrderId(null);
      if (res.order) {
        toast.success(`تم: ${CAFE_STATUS_LABELS[res.order.status]}`);
      } else if (res.error) {
        toast.error(res.error);
      }
      reload();
    });
  };

  const byStatus = (s: CafeOrderStatusDto) =>
    orders.filter((o) => o.status === s).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">شاشة الباريستا</h1>
          <p className="text-sm text-muted-foreground">
            الطلبات النشطة
            <ConnectionBadge status={connection} />
          </p>
        </div>
        <Button variant="outline" render={<Link href="/cafe" />}>
          شاشة الكافيه
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = byStatus(col.status);
          return (
            <section
              key={col.status}
              aria-label={col.title}
              className="rounded-xl border bg-muted/30 p-3"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                    {col.status === "NEW" ? <ChefHatIcon className="size-5" aria-hidden /> : col.status === "PREPARING" ? <CookingPotIcon className="size-5" aria-hidden /> : <CheckIcon className="size-5" aria-hidden />}
                    {col.title}
                  </h2>
                  <p className="text-xs text-muted-foreground">{col.hint}</p>
                </div>
                <span className="grid size-8 place-items-center rounded-full border bg-background text-lg font-bold tabular-nums">
                  {items.length}
                </span>
              </div>

              {pending && items.length === 0 ? (
                <div className="grid place-items-center py-10 text-muted-foreground">
                  <Loader2Icon className="size-6 animate-spin" aria-hidden />
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                  لا توجد طلبات
                </div>
              ) : (
                <div className="grid gap-3">
                  {items.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      now={now}
                      onAdvance={advance}
                      canCancel={canCancel && (o.status === "NEW" || o.status === "PREPARING")}
                      busy={pendingOrderId === o.id}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ConnectionBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    connected: { label: "متصل", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    connecting: { label: "جارٍ الاتصال", cls: "bg-amber-100 text-amber-800 border-amber-200" },
    reconnecting: { label: "إعادة الاتصال...", cls: "bg-amber-100 text-amber-800 border-amber-200" },
  };
  const s = map[status] ?? { label: "جارٍ الاتصال", cls: "bg-amber-100 text-amber-800 border-amber-200" };
  return (
    <Badge variant="outline" className={cn("ms-2", s.cls)}>
      {s.label}
    </Badge>
  );
}

function OrderCard({
  order,
  now,
  onAdvance,
  canCancel,
  busy,
}: {
  order: CafeOrderDto;
  now: number;
  onAdvance: (id: string, status: CafeOrderStatusDto) => void;
  canCancel: boolean;
  busy: boolean;
}) {
  const ageSeconds = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 1000));
  const nextAction =
    order.status === "NEW"
      ? { label: "بدء التحضير", status: "PREPARING" as CafeOrderStatusDto }
      : order.status === "PREPARING"
      ? { label: "جاهز", status: "READY" as CafeOrderStatusDto }
      : order.status === "READY"
      ? { label: "تم التسليم", status: "COMPLETED" as CafeOrderStatusDto }
      : null;

  return (
    <article
      className={cn(
        "rounded-xl border-2 bg-background p-4 shadow-sm",
        CAFE_STATUS_CARD_TONES[order.status],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xl font-black tabular-nums tracking-tight" dir="ltr">
          {order.orderNumber.split("-").slice(-1)[0]}
        </p>
        <p className="rounded-md bg-background/70 px-2 py-1 text-lg font-bold tabular-nums" dir="rtl">
          منذ {formatAge(ageSeconds)}
        </p>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {order.orderNumber} · {formatShortTime(order.createdAt)}
      </p>
      {order.customerName ? (
        <p className="mt-1 text-base font-bold">👤 {order.customerName}</p>
      ) : null}

      <ul className="mt-3 space-y-1.5">
        {order.items.map((it, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold">
              <span className="ms-1 text-xl font-black tabular-nums">{it.quantity}×</span>
              {it.productName}
              {it.sugarLevel ? (
                <Badge variant="outline" className="ms-2 align-middle text-xs font-semibold">
                  {sugarLabel(it.sugarLevel)}
                </Badge>
              ) : null}
            </span>
            {it.notes ? <span className="text-xs text-muted-foreground">{it.notes}</span> : null}
          </li>
        ))}
      </ul>

      {order.note ? (
        <p className="mt-2 rounded-md bg-foreground/5 px-2 py-1.5 text-base font-medium">📝 {order.note}</p>
      ) : null}

      {nextAction ? (
        <div className="mt-3 flex gap-2">
          <Button
            className="h-12 flex-1 text-base"
            disabled={busy}
            onClick={() => onAdvance(order.id, nextAction.status)}
          >
            {nextAction.label}
          </Button>
          {canCancel ? (
            <Button variant="ghost" className="h-12" disabled={busy} onClick={() => onAdvance(order.id, "CANCELLED")} aria-label="إلغاء الطلب">
              إلغاء
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
