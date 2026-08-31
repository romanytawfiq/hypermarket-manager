"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  LockIcon,
  MinusIcon,
  PlusIcon,
  ScanBarcodeIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { createSaleAction, posSearchAction } from "@/actions/sales-actions";
import { posSearchCustomersAction } from "@/actions/customer-actions";
import {
  getActiveShiftAction,
  openShiftAction,
  closeShiftAction,
  listShiftsAction,
} from "@/actions/shift-actions";
import type { SaleDto, PosProductDto } from "@/services/sales.service";
import type { PosCustomerDto } from "@/services/customer.service";
import type { ShiftDto } from "@/services/shift.service";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/sales/constants";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Receipt } from "@/components/pos/receipt";
import { cn } from "@/lib/utils";

function formatEgp(n: number): string {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}

interface CartItem {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  quantity: number;
  sellable: number;
  trackExpiry: boolean;
}

const PAYMENT_METHODS: PaymentMethod[] = [
  "CASH",
  "VISA",
  "MASTERCARD",
  "INSTAPAY",
  "VODAFONE_CASH",
  "OTHER",
];

export function PosScreen({
  activeShift,
  hasShiftsRead,
  hasReceiptsPrint,
  canCredit = false,
}: {
  activeShift: ShiftDto | null;
  hasShiftsRead: boolean;
  hasReceiptsPrint: boolean;
  canCredit?: boolean;
}) {
  const [shift, setShift] = useState<ShiftDto | null>(activeShift);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<PosProductDto[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomerDto | null>(null);
  const [onCredit, setOnCredit] = useState(false);
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<PosCustomerDto[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const [custSearching, setCustSearching] = useState(false);
  const [payments, setPayments] = useState<Array<{ method: PaymentMethod; amount: number }>>([]);
  const [cashTendered, setCashTendered] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSale, setLastSale] = useState<SaleDto | null>(null);

  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [actualCash, setActualCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closeResult, setCloseResult] = useState<ShiftDto | null>(null);

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const customerWrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
      if (customerWrapperRef.current && !customerWrapperRef.current.contains(e.target as Node)) {
        setCustOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const runSearch = useCallback(async (q: string): Promise<PosProductDto[]> => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearchOpen(false);
      setSearching(false);
      return [];
    }
    setSearching(true);
    const res = await posSearchAction(trimmed);
    setResults(res);
    setSearching(false);
    setSearchOpen(true);
    return res;
  }, []);

  const debouncedRun = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearchChange = (value: string) => {
    setSearchQuery(value);
    if (debouncedRun.current) clearTimeout(debouncedRun.current);
    debouncedRun.current = setTimeout(() => {
      runSearch(value);
    }, 250);
  };

  useEffect(() => () => {
    if (debouncedRun.current) clearTimeout(debouncedRun.current);
  }, []);

  const addToCart = (product: PosProductDto) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        if (existing.quantity >= product.sellable) {
          toast.warning(`لا يوجد مخزون كافٍ من '${product.name}'`);
          return prev;
        }
        return prev.map((c) =>
          c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          unitPrice: product.sellingPrice,
          quantity: 1,
          sellable: product.sellable,
          trackExpiry: product.trackExpiry,
        },
      ];
    });
    setSearchQuery("");
    setResults([]);
    setSearchOpen(false);
    searchInputRef.current?.focus();
  };

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleScanSubmit();
    }
  };

  /**
   * Barcode/scan fast path: USB scanners type the code then send Enter within
   * milliseconds — before the 250ms debounce has populated `results`. On Enter
   * we await a fresh lookup and add the top match immediately so a scan adds
   * the product without any extra click. Unknown codes surface a clear message.
   */
  const handleScanSubmit = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    const res = await runSearch(q);
    if (res.length > 0 && res[0]) {
      addToCart(res[0]);
    } else {
      setError("المنتج غير موجود");
      toast.warning("المنتج غير موجود");
    }
  };

  const changeQuantity = (productId: string, delta: number) => {    setCart((prev) =>
      prev.map((c) => {
        if (c.productId !== productId) return c;
        const next = c.quantity + delta;
        if (next < 1) return c;
        if (next > c.sellable) {
          toast.warning(`لا يمكن تجاوز المخزون المتاح (${c.sellable})`);
          return c;
        }
        return { ...c, quantity: next };
      }),
    );
  };

  const removeItem = (productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  };

  const total = useMemo(() => cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0), [cart]);

  const cashPaid = payments
    .filter((p) => p.method === "CASH")
    .reduce((s, p) => s + p.amount, 0);

  const paidTotal = payments.reduce((s, p) => s + p.amount, 0);
  const paymentsMatch = Math.abs(paidTotal - total) <= 0.01;
  const hasCash = payments.some((p) => p.method === "CASH");

  const tenderedNum = cashTendered ? Number(cashTendered) : NaN;
  const change = hasCash && !Number.isNaN(tenderedNum) ? tenderedNum - cashPaid : 0;

  const isCreditMode = onCredit && canCredit;

  const paymentValid =
    isCreditMode
      ? selectedCustomer !== null && paidTotal <= total + 0.01
      : payments.length > 0 && paidTotal > 0 && paymentsMatch;

  const canSubmit =
    shift !== null &&
    shift.status === "OPEN" &&
    cart.length > 0 &&
    paymentValid &&
    !submitting;

  const setPaymentAmount = (method: PaymentMethod, amount: number) => {
    setPayments((prev) => {
      const existing = prev.find((p) => p.method === method);
      if (existing) {
        return prev.map((p) => (p.method === method ? { ...p, amount } : p));
      }
      return [...prev, { method, amount }];
    });
  };

  const payAllInCash = () => {
    setPayments((prev) => {
      const rest = prev.filter((p) => p.method !== "CASH");
      const others = rest.reduce((s, p) => s + p.amount, 0);
      const cashAmount = Math.max(0, Math.round((total - others) * 100) / 100);
      return [...rest, { method: "CASH", amount: cashAmount }];
    });
  };

  const refreshShift = async () => {
    const s = await getActiveShiftAction();
    setShift(s);
    return s;
  };

  const runCustomerSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setCustResults([]);
      setCustOpen(false);
      setCustSearching(false);
      return;
    }
    setCustSearching(true);
    const res = await posSearchCustomersAction(trimmed);
    setCustResults(res);
    setCustSearching(false);
    setCustOpen(true);
  }, []);

  const custDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCustSearchChange = (value: string) => {
    setCustQuery(value);
    if (custDebounce.current) clearTimeout(custDebounce.current);
    custDebounce.current = setTimeout(() => {
      runCustomerSearch(value);
    }, 250);
  };

  useEffect(() => () => {
    if (custDebounce.current) clearTimeout(custDebounce.current);
  }, []);

  const submitSale = async () => {
    setError(null);
    setSubmitting(true);
    const items = cart.map((c) => ({ productId: c.productId, quantity: c.quantity }));
    const inPayments = payments
      .filter((p) => p.amount > 0)
      .map((p) => ({ method: p.method, amount: p.amount }));
    const idempotencyKey = crypto.randomUUID();
    try {
      const result = await createSaleAction({
        items,
        payments: inPayments,
        idempotencyKey,
        customerId: selectedCustomer?.id || undefined,
        onCredit: isCreditMode || undefined,
        customerName: selectedCustomer ? undefined : customerName || undefined,
        cashTendered: cashTendered ? Number(cashTendered) : undefined,
      });
      if (result.sale) {
        setLastSale(result.sale);
        setCart([]);
        setPayments([]);
        setCustomerName("");
        setSelectedCustomer(null);
        setCustQuery("");
        setCustResults([]);
        setCustOpen(false);
        setOnCredit(false);
        setCashTendered("");
        setError(null);
        toast.success(
          result.sale.paymentState === "PAID"
            ? "تمت عملية البيع بنجاح"
            : "تمت عملية البيع على الحساب بنجاح",
        );
        void refreshShift();
      } else if (result.error) {
        setError(result.error);
        toast.error(result.error);
      }
    } catch {
      setError("حدث خطأ غير متوقع أثناء إتمام البيع");
      toast.error("حدث خطأ أثناء إتمام البيع");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenShift = async () => {
    setError(null);
    const result = await openShiftAction({ openingCash: Number(openingCash) || 0 });
    if (result.success) {
      setShowOpenShift(false);
      setOpeningCash("");
      toast.success("تم فتح الوردية بنجاح");
      await refreshShift();
    } else if (result.error) {
      setError(result.error);
      toast.error(result.error);
    }
  };

  const handleCloseShift = async () => {
    if (!shift) return;
    setError(null);
    const result = await closeShiftAction(shift.id, {
      actualCash: Number(actualCash) || 0,
      note: closeNote,
    });
    if (result.success) {
      setShowCloseShift(false);
      setActualCash("");
      setCloseNote("");
      toast.success("تم إغلاق الوردية بنجاح");
      const active = await getActiveShiftAction();
      setShift(active);
      const closed = await listShiftsAction();
      const found = closed.find((s) => s.id === shift.id);
      if (found) setCloseResult(found);
    } else if (result.error) {
      setError(result.error);
      toast.error(result.error);
    }
  };

  const openCash = shift?.openingCash ?? 0;

  return (
    <div className="grid gap-6">
      {shift && shift.status === "OPEN" ? (
        <ShiftBanner
          cash={openCash}
          onClose={() => setShowCloseShift(true)}
          showClose={hasShiftsRead}
        />
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <div className="relative" ref={searchWrapperRef}>
            <ScanBarcodeIcon
              className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="مسح أو بحث عن منتج (باركود / رمز / اسم)"
              className="ps-9"
              disabled={!shift || shift.status !== "OPEN"}
            />
            {searchOpen && (searching || results.length > 0) ? (
              <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-lg border bg-popover shadow-lg">
                {searching ? (
                  <p className="p-3 text-sm text-muted-foreground">جارٍ البحث…</p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => addToCart(r)}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{r.name}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span>{formatEgp(r.sellingPrice)}</span>
                        <span className="text-xs">
                          ({r.sellable} {r.unit})
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border bg-background">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-heading text-sm font-bold">السلة</h2>
              {cart.length > 0 ? (
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setCart([]);
                    setPayments([]);
                    setOnCredit(false);
                    setSelectedCustomer(null);
                    searchInputRef.current?.focus();
                  }}
                >
                  <TrashIcon className="size-4" aria-hidden />
                  مسح السلة
                </Button>
              ) : null}
            </div>
            <div className="grid gap-1 p-2">
              {cart.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  السلة فارغة — أضف منتجات للبدء
                </p>
              ) : (
                cart.map((c) => (
                  <div key={c.productId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatEgp(c.unitPrice)} × {c.quantity}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        type="button"
                        onClick={() => changeQuantity(c.productId, -1)}
                        aria-label={`تقليل كمية ${c.name}`}
                      >
                        <MinusIcon className="size-4" aria-hidden />
                      </Button>
                      <span className="w-8 text-center text-sm">{c.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        type="button"
                        onClick={() => changeQuantity(c.productId, 1)}
                        aria-label={`زيادة كمية ${c.name}`}
                      >
                        <PlusIcon className="size-4" aria-hidden />
                      </Button>
                    </div>
                    <div className="w-24 text-end text-sm font-semibold">
                      {formatEgp(c.unitPrice * c.quantity)}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      type="button"
                      onClick={() => removeItem(c.productId)}
                      aria-label={`حذف ${c.name}`}
                    >
                      <XIcon className="size-4" aria-hidden />
                    </Button>
                  </div>
                ))
              )}
            </div>
            <div className="flex items-center justify-between border-t px-4 py-3">
              <span className="text-sm text-muted-foreground">الإجمالي</span>
              <span className="text-lg font-bold">{formatEgp(total)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 self-start">
          <div className="rounded-lg border bg-background p-4">
            <h2 className="font-heading text-sm font-bold">طرق الدفع</h2>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant={hasCash ? "default" : "outline"}
                type="button"
                size="sm"
                onClick={payAllInCash}
                disabled={!shift || shift.status !== "OPEN" || cart.length === 0}
              >
                نقدي
              </Button>
            </div>

            <div className="mt-3 grid gap-2">
              {PAYMENT_METHODS.map((m) => {
                const sel = payments.find((p) => p.method === m);
                const active = Boolean(sel);
                return (
                  <div key={m} className="rounded-lg border p-2">
                    <Button
                      variant={active ? "secondary" : "outline"}
                      type="button"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => {
                        if (active) {
                          setPayments((prev) => prev.filter((p) => p.method !== m));
                        } else {
                          setPaymentAmount(m, 0);
                        }
                      }}
                      disabled={!shift || shift.status !== "OPEN"}
                    >
                      <span>{PAYMENT_METHOD_LABELS[m]}</span>
                      {active ? <CheckIcon className="size-4" aria-hidden /> : null}
                    </Button>
                    {active && sel ? (
                      <div className="mt-2">
                        <Input
                          type="number"
                          min={0}
                          value={Number.isFinite(sel.amount) ? sel.amount : ""}
                          onChange={(e) => setPaymentAmount(m, Number(e.target.value) || 0)}
                          placeholder="المبلغ"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {hasCash ? (
              <div className="mt-3 grid gap-2">
                <label className="text-sm">المبلغ المدفوع نقدًا (المستلم)</label>
                <Input
                  type="number"
                  min={0}
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  placeholder="0"
                />
                {!Number.isNaN(tenderedNum) && cashTendered !== "" ? (
                  tenderedNum < cashPaid ? (
                    <p className="text-sm text-destructive">المبلغ النقدي أقل من المستحق نقدًا</p>
                  ) : (
                    <p className="text-sm font-medium">الباقي: {formatEgp(change)}</p>
                  )
                ) : null}
              </div>
            ) : null}

            {canCredit ? (
              <div className="mt-3 grid gap-2">
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span>بيع على الحساب</span>
                  <Switch id="pos-credit" checked={onCredit} onCheckedChange={setOnCredit} />
                </label>
                <p className="text-xs text-muted-foreground">
                  عند التفعيل قد يكون الدفع أقل من الإجمالي ويُسجَّل المتبقي دَيْنًا على العميل.
                </p>
              </div>
            ) : null}

            {isCreditMode ? (
              <div className="mt-3 grid gap-2">
                <label className="text-sm">العميل *</label>
                <div className="relative" ref={customerWrapperRef}>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between gap-2 rounded-lg border p-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{selectedCustomer.name}</p>
                        <p className="text-xs text-muted-foreground">
                          رصيده المستحق: {formatEgp(selectedCustomer.balance)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setCustQuery("");
                        }}
                      >
                        <XIcon className="size-4" aria-hidden />
                        تغيير
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={custQuery}
                        onChange={(e) => onCustSearchChange(e.target.value)}
                        placeholder="بحث عن العميل بالاسم أو الهاتف"
                      />
                      {custOpen && (custSearching || custResults.length > 0) ? (
                        <div className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-lg border bg-popover shadow-lg">
                          {custSearching ? (
                            <p className="p-3 text-sm text-muted-foreground">جارٍ البحث…</p>
                          ) : (
                            custResults.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setSelectedCustomer(c);
                                  setCustOpen(false);
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-start text-sm hover:bg-muted",
                                  !c.allowCredit && "opacity-60",
                                )}
                              >
                                <span className="font-medium">{c.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {c.phone || "—"} · مستحق {formatEgp(c.balance)}
                                  {!c.allowCredit ? " · لا يُسمح بالحساب" : ""}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3 grid gap-2">
                <label className="text-sm">اسم العميل (اختياري)</label>
                <Input
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="اسم العميل"
                />
              </div>
            )}

            <div className="mt-3">
              {isCreditMode ? (
                paidTotal > total + 0.01 ? (
                  <p className="text-sm text-destructive">المبلغ المدفوع يتجاوز إجمالي الفاتورة</p>
                ) : selectedCustomer && paidTotal < total - 0.01 && total > 0 ? (
                  <p className="flex items-center gap-1 text-sm font-medium text-amber-700">
                    سيُسجَّل المتبقي ({formatEgp(total - paidTotal)}) دَيْنًا على {selectedCustomer.name}
                  </p>
                ) : null
              ) : payments.length > 0 ? (
                paymentsMatch ? (
                  <p className="flex items-center gap-1 text-sm font-medium text-emerald-700">
                    <CheckIcon className="size-4" aria-hidden />
                    الدفع الإجمالي يساوي إجمالي الفاتورة
                  </p>
                ) : (
                  <p className="text-sm text-destructive">
                    الدفع الإجمالي يجب أن يساوي إجمالي الفاتورة
                  </p>
                )
              ) : null}
            </div>

            {error ? (
              <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              className="mt-4 w-full"
              size="lg"
              disabled={!canSubmit}
              onClick={submitSale}
            >
              إتمام الدفع
            </Button>

            {!shift ? (
              <LockMessage
                message="افتح وردية للبدء بالبيع"
                action={<Button className="mt-2 w-full" onClick={() => setShowOpenShift(true)}>فتح الوردية</Button>}
              />
            ) : null}
          </div>
        </div>
      </div>

      <Dialog open={showOpenShift} onOpenChange={setShowOpenShift}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>فتح الوردية</DialogTitle>
            <DialogDescription>أدخل المبلغ الافتتاحي للصندوق</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm">المبلغ الافتتاحي</label>
              <Input
                type="number"
                min={0}
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0"
              />
            </div>
            <Button onClick={handleOpenShift}>
              <LockIcon className="size-4" aria-hidden />
              فتح الوردية
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showCloseShift} onOpenChange={setShowCloseShift}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>إغلاق الوردية</DialogTitle>
            <DialogDescription>أدخل المبلغ الفعلي في الصندوق لعمل الجرد</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm">المبلغ الفعلي</label>
              <Input
                type="number"
                min={0}
                value={actualCash}
                onChange={(e) => setActualCash(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm">ملاحظة (اختياري)</label>
              <Input
                value={closeNote}
                onChange={(e) => setCloseNote(e.target.value)}
                placeholder="ملاحظة"
              />
            </div>
            <Button variant="destructive" onClick={handleCloseShift}>
              إغلاق الوردية
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeResult !== null} onOpenChange={(v) => !v && setCloseResult(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>تم إغلاق الوردية</DialogTitle>
            <DialogDescription>ملخص إغلاق الوردية</DialogDescription>
          </DialogHeader>
          {closeResult ? (
            <div className="grid gap-2 text-sm">
              <Row label="متوقع" value={formatEgp(closeResult.expectedCash ?? 0)} />
              <Row label="فعلي" value={formatEgp(closeResult.actualCash ?? 0)} />
              <Row
                label="الفرق"
                value={formatEgp(closeResult.variance ?? 0)}
                tone={(closeResult.variance ?? 0) < 0 ? "red" : (closeResult.variance ?? 0) > 0 ? "green" : undefined}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={lastSale !== null} onOpenChange={(v) => !v && setLastSale(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>فاتورة البيع</DialogTitle>
            <DialogDescription>فحص الفاتورة وطباعتها</DialogDescription>
          </DialogHeader>
          {lastSale ? (
            <div className="grid gap-3">
              <Receipt sale={lastSale} canPrint={hasReceiptsPrint} onClose={() => setLastSale(null)} />
              <Button
                className="w-full"
                size="lg"
                type="button"
                onClick={() => {
                  setLastSale(null);
                  searchInputRef.current?.focus();
                }}
              >
                عملية بيع جديدة
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShiftBanner({
  cash,
  onClose,
  showClose,
}: {
  cash: number;
  onClose: () => void;
  showClose: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-emerald-50 px-4 py-3">
      <p className="text-sm font-medium text-emerald-800">
        وردية مفتوحة — افتتاح: {formatEgp(cash)}
      </p>
      {showClose ? (
        <Button variant="outline" size="sm" onClick={onClose}>
          إغلاق الوردية
        </Button>
      ) : null}
    </div>
  );
}

function LockMessage({
  message,
  action,
}: {
  message: string;
  action: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-lg border bg-muted/40 p-4 text-center">
      <LockIcon className="mx-auto size-5 text-muted-foreground" aria-hidden />
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red" | "green";
}) {
  return (
    <div className="flex items-center justify-between border-b py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-semibold",
          tone === "red" && "text-destructive",
          tone === "green" && "text-emerald-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}
