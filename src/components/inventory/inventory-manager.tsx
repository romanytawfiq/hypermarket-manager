"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  ArchiveIcon,
  BoxesIcon,
  Loader2Icon,
  PackageCheckIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { ProductStockSummary } from "@/services/inventory.service";
import { adjustStockAction, stockCountAction } from "@/actions/inventory-actions";
import { cn } from "@/lib/utils";
import Link from "next/link";

type DialogState =
  | { kind: "adjust"; row: ProductStockSummary }
  | { kind: "count"; row: ProductStockSummary }
  | null;

export function InventoryManager({
  rows,
  expirySummary,
  canAdjust,
  canCount,
}: {
  rows: ProductStockSummary[];
  expirySummary: { expiringCount: number; expiredCount: number; totalBatches: number };
  canAdjust: boolean;
  canCount: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [q, setQ] = useState("");

  const filtered = q.trim()
    ? rows.filter(
        (r) => r.name.includes(q) || r.sku?.includes(q) || r.barcode?.includes(q),
      )
    : rows;

  const lowCount = rows.filter((r) => r.low).length;
  const outCount = rows.filter((r) => r.out).length;

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المخزون</h1>
          <p className="text-sm text-muted-foreground">
            الحالة الحالية للمخزون وتعديلاته
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard icon={<ArchiveIcon className="size-4" aria-hidden />} label="إجمالي المنتجات" value={rows.length} tone="default" />
        <SummaryCard icon={<AlertTriangleIcon className="size-4" aria-hidden />} label="مخزون منخفض" value={lowCount} tone="warning" />
        <SummaryCard icon={<BoxesIcon className="size-4" aria-hidden />} label="نفد من المخزون" value={outCount} tone="danger" />
        <SummaryCard
          icon={<PackageCheckIcon className="size-4" aria-hidden />}
          label="انتهاء الصلاحية"
          value={expirySummary.expiredCount + expirySummary.expiringCount}
          tone="warning"
          sub={expirySummary.expiredCount > 0 ? `${expirySummary.expiredCount} منتهية` : undefined}
        />
      </div>

      {/* Search */}
      <div className="relative">
        <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الباركود أو SKU" className="ps-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المنتج</TableHead>
              <TableHead>المتوفر</TableHead>
              <TableHead>الحد الأدنى</TableHead>
              <TableHead>الحاجة لإعادة التخزين</TableHead>
              <TableHead>الحالة</TableHead>
              {canAdjust || canCount ? <TableHead className="text-end">إجراءات</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canAdjust || canCount ? 6 : 5} className="h-24 text-center text-muted-foreground">
                  لا توجد منتجات مطابقة
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <InventoryRow
                  key={row.id}
                  row={row}
                  canAdjust={canAdjust}
                  canCount={canCount}
                  onAdjust={() => setDialog({ kind: "adjust", row })}
                  onCount={() => setDialog({ kind: "count", row })}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog?.kind === "adjust"} onOpenChange={(open) => setDialog(open && dialog?.kind === "adjust" ? dialog : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المخزون</DialogTitle>
            <DialogDescription>{dialog?.kind === "adjust" ? dialog.row.name : ""}</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "adjust" ? <AdjustStockForm row={dialog.row} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "count"} onOpenChange={(open) => setDialog(open && dialog?.kind === "count" ? dialog : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>جرد المخزون</DialogTitle>
            <DialogDescription>{dialog?.kind === "count" ? dialog.row.name : ""}</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "count" ? <StockCountForm row={dialog.row} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  tone,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "default" | "warning" | "danger";
  sub?: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-bold",
          tone === "warning" && "text-amber-600",
          tone === "danger" && "text-destructive",
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function InventoryRow({
  row,
  canAdjust,
  canCount,
  onAdjust,
  onCount,
}: {
  row: ProductStockSummary;
  canAdjust: boolean;
  canCount: boolean;
  onAdjust: () => void;
  onCount: () => void;
}) {
  const out = row.out;
  const low = row.low;
  return (
    <TableRow>
      <TableCell>
        <Link href={`/products/${row.id}`} className="font-medium hover:underline">
          {row.name}
        </Link>
      </TableCell>
      <TableCell>
        <span className={cn("font-semibold", out ? "text-destructive" : low ? "text-amber-600" : "text-emerald-700")}>
          {row.sellable} {row.unit}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{row.minimumStock}</TableCell>
      <TableCell className="text-muted-foreground">{row.suggested > 0 ? row.suggested : "—"}</TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            out
              ? "bg-rose-100 text-rose-700"
              : low
                ? "bg-amber-100 text-amber-700"
                : "bg-emerald-100 text-emerald-700",
          )}
        >
          {out ? "نفد" : low ? "مخزون منخفض" : "متوفر"}
        </span>
      </TableCell>
      {canAdjust || canCount ? (
        <TableCell className="text-end">
          <div className="flex items-center justify-end gap-1">
            {canAdjust ? (
              <Button variant="outline" size="sm" onClick={onAdjust}>
                <PlusIcon className="size-4" aria-hidden />
                تعديل
              </Button>
            ) : null}
            {canCount ? (
              <Button variant="outline" size="sm" onClick={onCount}>
                <PackageCheckIcon className="size-4" aria-hidden />
                جرد
              </Button>
            ) : null}
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

export function AdjustStockForm({ row, onSuccess }: { row: ProductStockSummary; onSuccess: () => void }) {
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await adjustStockAction({
        productId: row.id,
        quantity: Number(quantity),
        reason,
      });
      if (result.success) {
        toast.success("تم تعديل المخزون");
        onSuccess();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  const current = row.sellable;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-4" noValidate>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        المخزون الحالي المتاح: <span className="font-semibold">{current}</span>
      </p>
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="adjust-quantity">الكمية (موجب للإضافة، سالب للخصم)</Label>
        <Input id="adjust-quantity" type="number" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="مثال: 5 أو -3" />
        <p className="text-xs text-muted-foreground">
          سيسجل هذا كحركة &quot;تعديل&quot; في سجل الحركات
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="adjust-reason">سبب التعديل *</Label>
        <Textarea id="adjust-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تصحيح رقمي من جرد سابق" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending || quantity === "" || reason.trim() === ""}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          حفظ التعديل
        </Button>
      </div>
    </form>
  );
}

export function StockCountForm({ row, onSuccess }: { row: ProductStockSummary; onSuccess: () => void }) {
  const [counted, setCounted] = useState(String(row.sellable));
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setActionError(undefined);
    startTransition(async () => {
      const result = await stockCountAction({
        productId: row.id,
        countedQuantity: Number(counted),
        note: note || undefined,
      });
      if (result.success) {
        toast.success("تم تسجيل الجرد");
        onSuccess();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  const delta = (Number(counted) || 0) - row.sellable;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="grid gap-4" noValidate>
      <p className="rounded-lg bg-muted px-3 py-2 text-sm">
        المخزون المسجل حاليًا: <span className="font-semibold">{row.sellable}</span>
      </p>
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="count-quantity">الكمية الفعلية بعد الجرد</Label>
        <Input id="count-quantity" type="number" step="1" value={counted} onChange={(e) => setCounted(e.target.value)} />
        {delta !== 0 ? (
          <p className="text-xs text-muted-foreground">
            سيُضبط المخزون بقيمة {delta > 0 ? "+" : ""}{delta}
          </p>
        ) : null}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="count-note">ملاحظة (اختياري)</Label>
        <Textarea id="count-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات حول الجرد" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending || counted === ""}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          تسجيل الجرد
        </Button>
      </div>
    </form>
  );
}
