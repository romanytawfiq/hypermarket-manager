"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "@/components/ui/select";
import { toast } from "sonner";
import type { ProductDto } from "@/services/catalog.service";
import type { PurchaseDto } from "@/services/purchasing.service";
import {
  createPurchaseAction,
  receivePurchaseAction,
  createSupplierPaymentAction,
  createSupplierReturnAction,
} from "@/actions/purchasing-actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/sales/constants";

function ActionError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
      {message}
    </p>
  );
}

/* ---------------- Create Purchase ---------------- */

export function CreatePurchaseForm({
  supplierId,
  supplierName,
  suppliers,
  products,
  onSuccess,
}: {
  supplierId?: string;
  supplierName?: string;
  suppliers?: { id: string; name: string }[];
  products: ProductDto[];
  onSuccess: () => void;
}) {
  const router = useRouter();
  const [supplierIdState, setSupplierIdState] = useState(supplierId ?? "");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [paidImmediately, setPaidImmediately] = useState(false);
  const [lines, setLines] = useState<Array<{ productId: string; quantity: string; cost: string; batchCode: string; expiryDate: string }>>([
    { productId: "", quantity: "", cost: "", batchCode: "", expiryDate: "" },
  ]);
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const activeProducts = products.filter((p) => p.active);

  const setLine = (i: number, patch: Partial<(typeof lines)[number]>) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const total = lines.reduce((s, l) => {
    const q = Number(l.quantity) || 0;
    const c = Number(l.cost) || 0;
    return s + q * c;
  }, 0);

  const submit = () => {
    setActionError(undefined);
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        quantity: Number(l.quantity),
        cost: Number(l.cost) || 0,
        batchCode: l.batchCode || undefined,
        expiryDate: l.expiryDate || undefined,
      }));
    if (items.length === 0) {
      setActionError("أضف منتجًا واحدًا على الأقل بكمية أكبر من صفر");
      return;
    }
    if (!supplierIdState) {
      setActionError("اختر المورد");
      return;
    }
    startTransition(async () => {
      const result = await createPurchaseAction({
        supplierId: supplierIdState,
        invoiceNumber: invoiceNumber || undefined,
        paymentTerms: paymentTerms || undefined,
        paidImmediately,
        items,
      });
      if (result.success) {
        toast.success("تم إنشاء المشتريات");
        onSuccess();
        router.refresh();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4"
      noValidate
    >
      {supplierName ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm">
          المورد: <span className="font-semibold">{supplierName}</span>
        </p>
      ) : (
        <div className="grid gap-2">
          <Label>المورد *</Label>
          <select
            value={supplierIdState}
            onChange={(e) => setSupplierIdState(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
          >
            <option value="">اختر المورد</option>
            {suppliers?.filter((s) => s.name).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}
      <ActionError message={actionError} />

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="inv-number">رقم فاتورة المورد</Label>
          <Input id="inv-number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="اختياري" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pay-terms">شروط الدفع</Label>
          <Input id="pay-terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="مثال: نقدي / آجل" />
        </div>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label>المنتجات</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, { productId: "", quantity: "", cost: "", batchCode: "", expiryDate: "" }])}>
            <PlusIcon className="size-4" aria-hidden />
            إضافة منتج
          </Button>
        </div>

        {lines.map((line, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-3">
            <div className="grid gap-2">
              <Label className="text-xs">المنتج *</Label>
              <select
                value={line.productId}
                onChange={(e) => {
                  const product = products.find((p) => p.id === e.target.value);
                  setLine(i, { productId: e.target.value, cost: product ? String(product.purchaseCost) : line.cost });
                }}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">اختر المنتج</option>
                {activeProducts.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-xs">الكمية *</Label>
                <Input type="number" min="1" step="1" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">التكلفة للوحدة</Label>
                <Input type="number" min="0" step="0.01" value={line.cost} onChange={(e) => setLine(i, { cost: e.target.value })} />
              </div>
            </div>
            {lines.length > 1 ? (
              <Button type="button" variant="ghost" size="sm" className="justify-self-end" onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                <Trash2Icon className="size-4" aria-hidden />
                حذف
              </Button>
            ) : null}
          </div>
        ))}
      </div>

      <p className="text-end text-sm text-muted-foreground">
        الإجمالي: <span className="font-semibold text-foreground">{Math.round(total).toLocaleString("ar-EG")} ج.م</span>
      </p>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={paidImmediately} onChange={(e) => setPaidImmediately(e.target.checked)} className="size-4 accent-primary" />
        الدفع نقدًا فورًا (لا يُضاف رصيد مستحق)
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          إنشاء المشتريات
        </Button>
      </div>
    </form>
  );
}

/* ---------------- Pay Supplier ---------------- */

export function PaySupplierForm({ supplierId, onSuccess }: { supplierId: string; onSuccess: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setActionError(undefined);
    if (!Number(amount) || Number(amount) <= 0) {
      setActionError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    startTransition(async () => {
      const result = await createSupplierPaymentAction({
        supplierId,
        amount: Number(amount),
        method,
        // A stable per-form key prevents duplicate posting if a retry happens
        // after the request succeeded server-side but the response was lost.
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.success) {
        toast.success("تم تسجيل الدفعة");
        onSuccess();
        router.refresh();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4"
      noValidate
    >
      <ActionError message={actionError} />
      <div className="grid gap-2">
        <Label htmlFor="pay-amount">المبلغ *</Label>
        <Input id="pay-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="بالجنيه المصري" />
      </div>
      <div className="grid gap-2">
        <Label>طريقة الدفع</Label>
        <Select value={method} onValueChange={(v) => setMethod((v as PaymentMethod) ?? "CASH")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          تسجيل الدفعة
        </Button>
      </div>
    </form>
  );
}

/* ---------------- Receive Purchase ---------------- */

export function ReceivePurchaseForm({ purchase, onSuccess }: { purchase: PurchaseDto; onSuccess: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState(
    purchase.items.map((it) => ({
      productId: it.productId,
      accepted: String(it.quantity - it.receivedQuantity),
      rejected: "0",
    })),
  );
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const submit = () => {
    setActionError(undefined);
    const items = rows
      .map((r) => ({
        productId: r.productId,
        acceptedQuantity: Number(r.accepted) || 0,
        rejectedQuantity: Number(r.rejected) || 0,
      }))
      .filter((r) => r.acceptedQuantity > 0 || r.rejectedQuantity > 0);
    if (items.length === 0) {
      setActionError("أدخل كميات مقبولة أو مرفوضة لعنصر واحد على الأقل");
      return;
    }
    startTransition(async () => {
      const result = await receivePurchaseAction({ purchaseId: purchase.id, items });
      if (result.success) {
        toast.success("تم استلام المشتريات");
        onSuccess();
        router.refresh();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4"
      noValidate
    >
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        المشتريات: <span className="font-semibold">{purchase.purchaseNumber}</span> — {purchase.supplierName}
      </p>
      <ActionError message={actionError} />
      <div className="grid gap-3">
        {purchase.items.map((it, i) => {
          const remaining = it.quantity - it.receivedQuantity;
          return (
            <div key={it.productId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
              <div className="sm:col-span-3">
                <p className="text-sm font-medium">{it.productName}</p>
                <p className="text-xs text-muted-foreground">المتبقي للاستلام: {remaining}</p>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">مقبول *</Label>
                <Input type="number" min="0" step="1" value={rows[i]?.accepted ?? ""} onChange={(e) => setRow(i, { accepted: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">مرفوض</Label>
                <Input type="number" min="0" step="1" value={rows[i]?.rejected ?? "0"} onChange={(e) => setRow(i, { rejected: e.target.value })} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          تأكيد الاستلام
        </Button>
      </div>
    </form>
  );
}

/* ---------------- Supplier Return ---------------- */

export function SupplierReturnForm({ purchase, onSuccess }: { purchase: PurchaseDto; onSuccess: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState(
    purchase.items
      .filter((it) => it.receivedQuantity > 0)
      .map((it) => ({
        productId: it.productId,
        productName: it.productName,
        cost: it.cost,
        quantity: "",
        reason: "",
      })),
  );
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };

  const submit = () => {
    setActionError(undefined);
    const items = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity),
        cost: r.cost,
        reason: r.reason || undefined,
      }));
    if (items.length === 0) {
      setActionError("أدخل كمية مرتدة لعنصر واحد على الأقل");
      return;
    }
    startTransition(async () => {
      const result = await createSupplierReturnAction({
        supplierId: purchase.supplierId,
        purchaseId: purchase.id,
        items,
      });
      if (result.success) {
        toast.success("تم تسجيل المرتجع");
        onSuccess();
        router.refresh();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="grid gap-4"
      noValidate
    >
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        مرتجع من المشتريات: <span className="font-semibold">{purchase.purchaseNumber}</span>
      </p>
      <ActionError message={actionError} />
      <div className="grid gap-3">
        {rows.map((r, i) => (
          <div key={r.productId} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">{r.productName}</p>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">الكمية المرتدة *</Label>
              <Input type="number" min="1" step="1" value={r.quantity} onChange={(e) => setRow(i, { quantity: e.target.value })} />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">السبب</Label>
              <Input value={r.reason} onChange={(e) => setRow(i, { reason: e.target.value })} placeholder="اختياري" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          تسجيل المرتجع
        </Button>
      </div>
    </form>
  );
}
