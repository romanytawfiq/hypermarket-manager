"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2Icon, RefreshCcwIcon, EyeIcon, BanIcon } from "lucide-react";
import {
  listOnlineOrdersPageAction,
  transitionOnlineOrderAction,
} from "@/actions/online-store-actions";
import type {
  OnlineOrderDto,
  OnlineOrdersPageResult,
} from "@/services/online-store.service";
import type { OnlineOrderStatus, OnlinePaymentState, OnlineOrderPaymentMethod } from "@/models/online-order";
import {
  onlineOrderStatusLabel,
  onlinePaymentStateLabel,
  onlinePaymentMethodLabel,
} from "@/lib/online-store/labels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { formatEgp, formatDateTime } from "@/lib/format";

const STATUSES: OnlineOrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_DELIVERY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];
const PAYMENT_STATES: OnlinePaymentState[] = [
  "PAYMENT_PENDING",
  "PAID_ONLINE",
  "PAID_AT_DELIVERY",
];
const PAYMENT_METHODS: OnlineOrderPaymentMethod[] = ["COD", "ONLINE"];

const NEXT_STEP: Record<string, OnlineOrderStatus | undefined> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY_FOR_DELIVERY",
  READY_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  OUT_FOR_DELIVERY: "DELIVERED",
};

const PAGE_SIZE = 20;

/**
 * Admin Online Orders dashboard (Phase 9). Server-filtered + paginated so the
 * browser never holds the full order set. Order status changes go through
 * `transitionOnlineOrderAction`, which re-validates the state machine server-side;
 * no arbitrary client status value is ever accepted.
 */
export function OnlineOrdersAdmin({ canManage }: { canManage: boolean }) {
  const [data, setData] = useState<OnlineOrdersPageResult | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const [, startTransition] = useTransition();

  const [status, setStatus] = useState<string>("");
  const [paymentState, setPaymentState] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");

  const [transit, setTransit] = useState<Record<string, boolean>>({});
  const [revision, setRevision] = useState(0);
  const [appliedSearch, setAppliedSearch] = useState("");

  // Single authoritative load path: filters + page + revision drive this effect.
  // All state updates happen after the await, so no setState runs synchronously
  // inside the effect body; a `cancelled` flag discards stale old responses.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const res = await listOnlineOrdersPageAction({
        page,
        pageSize: PAGE_SIZE,
        status: (status as OnlineOrderStatus) || undefined,
        paymentState: (paymentState as OnlinePaymentState) || undefined,
        paymentMethod: (paymentMethod as OnlineOrderPaymentMethod) || undefined,
        from: from || undefined,
        to: to || undefined,
        search: appliedSearch,
      });
      if (cancelled) return;
      if (res) {
        setData(res);
        setPage(res.page);
        setError(undefined);
      } else {
        setData(null);
        setError("تعذّر تحميل الطلبات. حاول مرة أخرى");
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [page, status, paymentState, paymentMethod, from, to, appliedSearch, revision]);

  // Re-query the first page with the currently typed search term.
  function applyFilters() {
    setLoading(true);
    setAppliedSearch(search.trim());
    setPage(1);
  }

  function resetFilters() {
    setLoading(true);
    setStatus("");
    setPaymentState("");
    setPaymentMethod("");
    setFrom("");
    setTo("");
    setSearch("");
    setAppliedSearch("");
    setPage(1);
  }

  function refresh() {
    setLoading(true);
    setRevision((r) => r + 1);
  }

  function transition(order: OnlineOrderDto, target: OnlineOrderStatus) {
    setTransit((p) => ({ ...p, [order.id]: true }));
    startTransition(async () => {
      const res = await transitionOnlineOrderAction({ orderId: order.id, targetStatus: target });
      setTransit((p) => ({ ...p, [order.id]: false }));
      if (res.order) {
        toast.success(target === "CANCELLED" ? "تم إلغاء الطلب" : "تم تحديث حالة الطلب");
        setLoading(true);
        setRevision((r) => r + 1);
      } else {
        toast.error(res.error ?? "تعذّر تحديث حالة الطلب");
      }
    });
  }

  function goToPage(next: number) {
    setLoading(true);
    setPage(next);
  }

  const filtersActive = Boolean(status || paymentState || paymentMethod || from || to || search);
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <section className="rounded-lg border bg-background p-3">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="od-status">الحالة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v ?? "")}>
              <SelectTrigger id="od-status" className="w-full">
                <SelectValue placeholder="كل الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الحالات</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{onlineOrderStatusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="od-payment-state">حالة الدفع</Label>
            <Select value={paymentState} onValueChange={(v) => setPaymentState(v ?? "")}>
              <SelectTrigger id="od-payment-state" className="w-full">
                <SelectValue placeholder="كل حالات الدفع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل حالات الدفع</SelectItem>
                {PAYMENT_STATES.map((s) => (
                  <SelectItem key={s} value={s}>{onlinePaymentStateLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="od-payment-method">طريقة الدفع</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? "")}>
              <SelectTrigger id="od-payment-method" className="w-full">
                <SelectValue placeholder="كل الطرق" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الطرق</SelectItem>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{onlinePaymentMethodLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="od-search">بحث (رقم / اسم / هاتف)</Label>
            <div className="flex gap-2">
              <Input
                id="od-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyFilters();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={applyFilters}>
                بحث
              </Button>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="od-from">من تاريخ</Label>
            <Input id="od-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="od-to">إلى تاريخ</Label>
            <Input id="od-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={resetFilters} disabled={!filtersActive}>
            مسح عوامل التصفية
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? <Loader2Icon className="size-4 animate-spin" /> : <RefreshCcwIcon className="size-4" />}
            تحديث
          </Button>
        </div>
      </section>

      {/* Table */}
      <section className="rounded-lg border bg-background">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <h2 className="font-heading text-sm font-bold">الطلبات</h2>
          <span className="text-xs text-muted-foreground">{data?.total ?? "…"} طلب</span>
        </div>

        {loading && !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-destructive" role="alert">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {filtersActive ? "لا توجد طلبات مطابقة لمعايير التصفية." : "لا توجد طلبات متجر بعد."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="px-3 py-2 text-start font-medium">الطلب</th>
                  <th className="px-3 py-2 text-start font-medium">العميل</th>
                  <th className="px-3 py-2 text-start font-medium">التاريخ</th>
                  <th className="px-3 py-2 text-end font-medium">الإجمالي</th>
                  <th className="px-3 py-2 text-start font-medium">الدفع</th>
                  <th className="px-3 py-2 text-start font-medium">الحالة</th>
                  <th className="px-3 py-2 text-end font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((order) => (
                  <tr key={order.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-3 py-2">
                      <span className="font-semibold">{order.orderNumber}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div>{order.customerName}</div>
                      <div className="text-xs text-muted-foreground" dir="ltr">{order.customerPhone}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-end font-medium">{formatEgp(order.payableAmount)}</td>
                    <td className="px-3 py-2">
                      <div>{onlinePaymentMethodLabel(order.paymentMethod)}</div>
                      <div className="text-xs text-muted-foreground">
                        {onlinePaymentStateLabel(order.paymentState)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={order.status === "CANCELLED" ? "secondary" : "default"}>
                        {onlineOrderStatusLabel(order.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-end">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/online-orders/${order.id}`} aria-label={`عرض تفاصيل ${order.orderNumber}`}>
                          <Button variant="ghost" size="icon-sm">
                            <EyeIcon className="size-4" />
                          </Button>
                        </Link>
                        {canManage &&
                          order.status !== "DELIVERED" &&
                          order.status !== "CANCELLED" ? (
                          <>
                            {NEXT_STEP[order.status] ? (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={transit[order.id]}
                                onClick={() => transition(order, NEXT_STEP[order.status]!)}
                              >
                                {transit[order.id] ? (
                                  <Loader2Icon className="size-3.5 animate-spin" />
                                ) : null}
                                تقدم
                              </Button>
                            ) : null}
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={transit[order.id]}
                              onClick={() => transition(order, "CANCELLED")}
                            >
                              <BanIcon className="size-3.5" />
                              إلغاء
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pagination */}
      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.page <= 1 || loading}
            onClick={() => goToPage(data.page - 1)}
          >
            السابق
          </Button>
          <span className="text-sm text-muted-foreground">
            صفحة {data.page} من {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={data.page >= data.totalPages || loading}
            onClick={() => goToPage(data.page + 1)}
          >
            التالي
          </Button>
        </div>
      ) : null}
    </div>
  );
}