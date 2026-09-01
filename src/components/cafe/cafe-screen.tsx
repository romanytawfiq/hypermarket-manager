"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  MinusIcon,
  PlusIcon,
  Loader2Icon,
  CoffeeIcon,
  Trash2Icon,
  SearchIcon,
  HistoryIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  createCafeOrderAction,
  listKdsOrdersAction,
  listActiveCafeOrdersAction,
  listCafeOrderHistoryAction,
  cafeSearchProductsAction,
  cafeSearchCustomersAction,
  transitionCafeOrderAction,
} from "@/actions/cafe-actions";
import { useCafeRealtime } from "@/lib/realtime/cafe-events";
import {
  CAFE_STATUS_LABELS,
  CAFE_STATUS_TONES,
  formatEgp,
  formatAge,
  formatShortTime,
} from "@/lib/cafe/format";
import type { CafeOrderDto, CafeProductSearchDto, CafeCustomerSearchDto } from "@/services/cafe.service";

interface LineItem {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  notes: string;
}

export function CafeScreen({
  initialActive,
  initialHistory,
  canCreate,
  canTransition,
  canCancel,
  hasKds,
}: {
  initialActive: CafeOrderDto[];
  initialHistory: CafeOrderDto[];
  canCreate: boolean;
  canTransition: boolean;
  canCancel: boolean;
  hasKds: boolean;
}) {
  const [active, setActive] = useState(initialActive);
  const [history, setHistory] = useState(initialHistory);
  const [showHistory, setShowHistory] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // Track the callbacks we hand to the realtime hook so it always sees fresh ones.
  const handlersRef = useRef({ onEvent: undefined as undefined | (() => void), onReconnect: undefined as undefined | (() => void) });

  const refresh = (mode: "kds" | "active") => {
    startTransition(async () => {
      const items =
        mode === "kds"
          ? await listKdsOrdersAction()
          : await listActiveCafeOrdersAction();
      setActive(items);
    });
  };

  useEffect(() => {
    handlersRef.current.onEvent = () => {
      refresh(hasKds ? "kds" : "active");
    };
    handlersRef.current.onReconnect = () => {
      toast.info("تمت إعادة الاتصال — تحديث الطلبات");
      refresh(hasKds ? "kds" : "active");
    };
  }, [hasKds]);

  const realtime = useCafeRealtime(handlersRef);
  const connection = realtime.status;

  const loadHistory = () => {
    startTransition(async () => {
      const items = await listCafeOrderHistoryAction(20);
      setHistory(items);
    });
  };

  const onCreated = () => {
    setBuilderOpen(false);
    toast.success("تم إنشاء طلب الكافيه");
    refresh(hasKds ? "kds" : "active");
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">الكافيه</h1>
          <p className="text-sm text-muted-foreground">
            إنشاء طلبات الكافيه ومتابعة حالة التحضير
            <ConnectionBadge status={connection} />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasKds ? (
            <Button variant="outline" render={<Link href="/kds" />}>
              <CoffeeIcon className="size-4" aria-hidden />
              شاشة الباريستا
            </Button>
          ) : null}
          <Button variant={showHistory ? "default" : "outline"} onClick={() => setShowHistory((v) => !v)}>
            <HistoryIcon className="size-4" aria-hidden />
            السجل
          </Button>
          {canCreate ? (
            <Button onClick={() => setBuilderOpen(true)}>
              <PlusIcon className="size-4" aria-hidden />
              طلب جديد
            </Button>
          ) : null}
        </div>
      </div>

      {showHistory ? (
        <HistoryTable orders={history} onLoad={loadHistory} />
      ) : (
        <ActiveOrders
          orders={active}
          pending={pending}
          canTransition={canTransition}
          canCancel={canCancel}
          onTransition={(id, status) => {
            startTransition(async () => {
              const res = await transitionCafeOrderAction({ orderId: id, targetStatus: status });
              if (res.order) {
                toast.success(`تم تغيير الحالة إلى ${CAFE_STATUS_LABELS[res.order.status]}`);
              } else if (res.error) {
                toast.error(res.error);
              }
              refresh(hasKds ? "kds" : "active");
            });
          }}
        />
      )}

      {builderOpen ? (
        <OrderBuilder onSuccess={onCreated} />
      ) : null}
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

function ActiveOrders({
  orders,
  pending,
  canTransition,
  canCancel,
  onTransition,
}: {
  orders: CafeOrderDto[];
  pending: boolean;
  canTransition: boolean;
  canCancel: boolean;
  onTransition: (id: string, status: "PREPARING" | "READY" | "COMPLETED" | "CANCELLED") => void;
}) {
  if (pending && orders.length === 0) {
    return (
      <div className="grid place-items-center gap-3 rounded-lg border bg-background py-16 text-muted-foreground">
        <Loader2Icon className="size-6 animate-spin" aria-hidden />
        جارٍ تحميل الطلبات...
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="grid gap-2 rounded-lg border bg-background px-4 py-12 text-center">
        <CoffeeIcon className="mx-auto size-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">لا توجد طلبات نشطة</p>
        <p className="text-sm text-muted-foreground">ستظهر طلبات الكافيه هنا بعد إنشائها من نقطة البيع أو شاشة الكافيه.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {orders.map((o) => (
        <div key={o.id} className="rounded-lg border bg-background p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-sm font-bold" dir="ltr">{o.orderNumber}</p>
              <p className="text-xs text-muted-foreground">
                {formatShortTime(o.createdAt)} · منذ {formatAge(o.ageSeconds)}
              </p>
            </div>
            <Badge variant="outline" className={CAFE_STATUS_TONES[o.status]}>
              {CAFE_STATUS_LABELS[o.status]}
            </Badge>
          </div>
          {o.customerName ? <p className="mt-1 text-sm font-medium">👤 {o.customerName}</p> : null}
          <ul className="mt-3 divide-y">
            {o.items.map((it, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-bold tabular-nums">{it.quantity}×</span>
                  <span>
                    {it.productName}
                    {it.notes ? <span className="block text-xs text-muted-foreground">ملاحظة: {it.notes}</span> : null}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">{formatEgp(it.lineTotal)}</span>
              </li>
            ))}
          </ul>
          {o.note ? (
            <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-sm text-muted-foreground">📝 {o.note}</p>
          ) : null}
          <div className="mt-3 flex items-center justify-between border-t pt-3">
            <p className="text-sm font-bold">{formatEgp(o.totalAmount)}</p>
            <div className="flex flex-wrap gap-1.5">
              <TransitionButtons
                status={o.status}
                pending={pending}
                canTransition={canTransition}
                canCancel={canCancel}
                onTransition={(s) => onTransition(o.id, s)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TransitionButtons({
  status,
  pending,
  canTransition,
  canCancel,
  onTransition,
}: {
  status: CafeOrderDto["status"];
  pending: boolean;
  canTransition: boolean;
  canCancel: boolean;
  onTransition: (s: "PREPARING" | "READY" | "COMPLETED" | "CANCELLED") => void;
}) {
  const showCancel = (status === "NEW" || status === "PREPARING") && canCancel;
  return (
    <>
      {status === "NEW" && canTransition ? (
        <Button size="sm" disabled={pending} onClick={() => onTransition("PREPARING")}>
          بدء التحضير
        </Button>
      ) : null}
      {status === "PREPARING" && canTransition ? (
        <Button size="sm" disabled={pending} onClick={() => onTransition("READY")}>
          جاهز
        </Button>
      ) : null}
      {status === "READY" && canTransition ? (
        <Button size="sm" disabled={pending} onClick={() => onTransition("COMPLETED")}>
          تم التسليم
        </Button>
      ) : null}
      {showCancel ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => onTransition("CANCELLED")}>
          إلغاء
        </Button>
      ) : null}
    </>
  );
}

function HistoryTable({ orders, onLoad }: { orders: CafeOrderDto[]; onLoad: () => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-start text-muted-foreground">
            <th className="px-3 py-2 text-start font-medium">رقم الطلب</th>
            <th className="px-3 py-2 text-start font-medium">الوقت</th>
            <th className="px-3 py-2 text-start font-medium">الأصناف</th>
            <th className="px-3 py-2 text-start font-medium">الإجمالي</th>
            <th className="px-3 py-2 text-start font-medium">الحالة</th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">لا يوجد سجل بعد.</td>
            </tr>
          ) : (
            orders.map((o) => (
              <tr key={o.id} className="border-b last:border-0">
                <td className="px-3 py-2 font-mono text-xs" dir="ltr">{o.orderNumber}</td>
                <td className="px-3 py-2 text-muted-foreground">{formatShortTime(o.createdAt)}</td>
                <td className="px-3 py-2">{o.items.map((i) => i.productName).join("، ")}</td>
                <td className="px-3 py-2 font-semibold tabular-nums">{formatEgp(o.totalAmount)}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={CAFE_STATUS_TONES[o.status]}>{CAFE_STATUS_LABELS[o.status]}</Badge>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="border-t p-2">
        <Button variant="ghost" size="sm" onClick={onLoad}>
          تحديث السجل
        </Button>
      </div>
    </div>
  );
}

function OrderBuilder({ onSuccess }: { onSuccess: () => void }) {
  const [lines, setLines] = useState<LineItem[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CafeProductSearchDto[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CafeCustomerSearchDto[]>([]);
  const [customer, setCustomer] = useState<CafeCustomerSearchDto | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string>();
  const [searching, setSearching] = useState(false);
  const [pending, startTransition] = useTransition();

  const total = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const runSearch = (q: string) => {
    setQuery(q);
    if (q.trim().length < 1) {
      setResults([]);
      return;
    }
    setSearching(true);
    startTransition(async () => {
      const r = await cafeSearchProductsAction(q.trim());
      setResults(r);
      setSearching(false);
    });
  };

  const runCustomerSearch = (q: string) => {
    setCustomerQuery(q);
    if (q.trim().length < 2) {
      setCustomers([]);
      return;
    }
    startTransition(async () => {
      const r = await cafeSearchCustomersAction(q.trim());
      setCustomers(r);
    });
  };

  const addProduct = (p: CafeProductSearchDto) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id);
      if (existing) {
        return prev.map((l) =>
          l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { productId: p.id, name: p.name, unitPrice: p.sellingPrice, quantity: 1, notes: "" }];
    });
    setResults([]);
    setQuery("");
  };

  const setQty = (id: string, delta: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.productId === id ? { ...l, quantity: Math.max(1, l.quantity + delta) } : l,
      ),
    );
  };

  const removeLine = (id: string) => setLines((prev) => prev.filter((l) => l.productId !== id));

  const submit = () => {
    setActionError(undefined);
    if (lines.length === 0) {
      setActionError("أضف صنفًا واحدًا على الأقل");
      return;
    }
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `cafe-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    startTransition(async () => {
      const res = await createCafeOrderAction({
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          notes: l.notes.trim() || undefined,
        })),
        idempotencyKey,
        note: note.trim() || undefined,
        customerId: customer?.id,
      });
      if (res.order) {
        onSuccess();
      } else if (res.error) {
        setActionError(res.error);
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="طلب كافيه جديد">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-background p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">طلب كافيه جديد</h2>
          <Button variant="ghost" size="icon-sm" onClick={onSuccess} aria-label="إغلاق">
            ✕
          </Button>
        </div>

        {actionError ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-2">
          <Label htmlFor="cafe-search">ابحث عن منتج</Label>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="cafe-search"
              className="ps-9"
              value={query}
              onChange={(e) => runSearch(e.target.value)}
              placeholder="اسم المنتج أو الباركود"
            />
          </div>
          {results.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto rounded-lg border bg-background">
              {results.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-start text-sm hover:bg-muted"
                    onClick={() => addProduct(p)}
                  >
                    <span>{p.name}</span>
                    <span className="font-semibold tabular-nums">{formatEgp(p.sellingPrice)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searching ? (
            <p className="px-1 text-sm text-muted-foreground">جارٍ البحث...</p>
          ) : null}
        </div>

        {lines.length > 0 ? (
          <ul className="mt-3 divide-y rounded-lg border bg-background">
            {lines.map((l) => (
              <li key={l.productId} className="flex items-center gap-2 px-3 py-2">
                <div className="flex-1">
                  <p className="text-sm font-medium">{l.name}</p>
                  <Input
                    className="mt-1 h-7 w-40 text-xs"
                    value={l.notes}
                    placeholder="ملاحظة (بدون سكر...)"
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, notes: e.target.value } : x)))
                    }
                  />
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-xs" onClick={() => setQty(l.productId, -1)} aria-label="إنقاص">
                    <MinusIcon />
                  </Button>
                  <span className="w-8 text-center font-bold tabular-nums">{l.quantity}</span>
                  <Button variant="outline" size="icon-xs" onClick={() => setQty(l.productId, 1)} aria-label="زيادة">
                    <PlusIcon />
                  </Button>
                </div>
                <p className="w-20 text-end font-semibold tabular-nums text-sm">{formatEgp(l.unitPrice * l.quantity)}</p>
                <Button variant="ghost" size="icon-xs" onClick={() => removeLine(l.productId)} aria-label="حذف">
                  <Trash2Icon />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">لم تُضف أصناف بعد — ابحث عن منتج وأضفه للطلب.</p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="cafe-customer">العميل (اختياري)</Label>
            {customer ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span>👤 {customer.name}</span>
                <Button variant="ghost" size="sm" onClick={() => { setCustomer(null); setCustomerQuery(""); }}>
                  إزالة
                </Button>
              </div>
            ) : (
              <>
                <Input id="cafe-customer" value={customerQuery} onChange={(e) => runCustomerSearch(e.target.value)} placeholder="بحث بالاسم أو الهاتف" />
                {customers.length > 0 ? (
                  <ul className="max-h-32 overflow-y-auto rounded-lg border bg-background">
                    {customers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-start text-sm hover:bg-muted"
                          onClick={() => { setCustomer(c); setCustomers([]); setCustomerQuery(""); }}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="cafe-note">ملاحظة على الطلب</Label>
            <Textarea id="cafe-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: حليب إضافي" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t pt-4">
          <p className="text-lg font-bold">
            الإجمالي <span className="tabular-nums">{formatEgp(total)}</span>
          </p>
          <Button onClick={submit} disabled={pending || lines.length === 0}>
            {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
            إرسال إلى الباريستا
          </Button>
        </div>
      </div>
    </div>
  );
}
