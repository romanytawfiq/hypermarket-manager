"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownLeftIcon, PlusIcon, Undo2Icon } from "lucide-react";
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
import type { PurchaseDto } from "@/services/purchasing.service";
import type { SupplierDto } from "@/services/supplier.service";
import type { ProductDto } from "@/services/catalog.service";
import {
  CreatePurchaseForm,
  ReceivePurchaseForm,
  SupplierReturnForm,
} from "@/components/suppliers/purchase-forms";

function formatEgp(amount: number): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ج.م`;
}

type DialogState =
  | { kind: "create" }
  | { kind: "receive"; purchase: PurchaseDto }
  | { kind: "return"; purchase: PurchaseDto }
  | null;

const STATUS_FILTERS = [
  { value: "ALL", label: "الكل" },
  { value: "PENDING", label: "بانتظار الاستلام" },
  { value: "PARTIALLY_RECEIVED", label: "استلام جزئي" },
  { value: "RECEIVED", label: "مستلمة" },
] as const;

export function PurchasesManager({
  purchases,
  suppliers,
  products,
  canCreate,
  canReceive,
  canReturn,
}: {
  purchases: PurchaseDto[];
  suppliers: SupplierDto[];
  products: ProductDto[];
  canCreate: boolean;
  canReceive: boolean;
  canReturn: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [status, setStatus] = useState<(typeof STATUS_FILTERS)[number]["value"]>("ALL");

  const filtered = status === "ALL" ? purchases : purchases.filter((p) => p.status === status);

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المشتريات</h1>
          <p className="text-sm text-muted-foreground">
            تسجيل المشتريات والاستلام من الموردين
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon className="size-4" aria-hidden />
            شراء جديد
          </Button>
        ) : null}
      </div>

      <div className="flex gap-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              status === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الرقم</TableHead>
              <TableHead>المورد</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>الإجمالي</TableHead>
              <TableHead>الحالة</TableHead>
              {canReceive || canReturn ? <TableHead className="text-end">إجراءات</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canReceive || canReturn ? 6 : 5} className="h-24 text-center text-muted-foreground">
                  لا توجد مشتريات مطابقة
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.purchaseNumber}</TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("ar-EG")}</TableCell>
                  <TableCell className="font-semibold">{formatEgp(p.totalAmount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={p.status} />
                  </TableCell>
                  {(canReceive || canReturn) ? (
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        {canReceive && p.status !== "RECEIVED" ? (
                          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "receive", purchase: p })}>
                            <ArrowDownLeftIcon className="size-4" aria-hidden />
                            استلام
                          </Button>
                        ) : null}
                        {canReturn && p.status !== "PENDING" ? (
                          <Button variant="outline" size="sm" onClick={() => setDialog({ kind: "return", purchase: p })}>
                            <Undo2Icon className="size-4" aria-hidden />
                            مرتجع
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog?.kind === "create"} onOpenChange={(open) => setDialog(open ? { kind: "create" } : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>إنشاء شراء جديد</DialogTitle>
            <DialogDescription>حدد المورد ومنتجات المشتريات</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" ? (
            <CreatePurchaseForm suppliers={supplierOptions} products={products} onSuccess={refresh} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "receive"} onOpenChange={(open) => setDialog(open && dialog?.kind === "receive" ? dialog : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>استلام مشتريات</DialogTitle>
            <DialogDescription>تأكيد الكميات المقبولة</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "receive" ? <ReceivePurchaseForm purchase={dialog.purchase} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "return"} onOpenChange={(open) => setDialog(open && dialog?.kind === "return" ? dialog : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>مرتجع مشتريات</DialogTitle>
            <DialogDescription>تسجيل مرتجع للمورد</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "return" ? <SupplierReturnForm purchase={dialog.purchase} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: PurchaseDto["status"] }) {
  const map: Record<PurchaseDto["status"], { label: string; cls: string }> = {
    PENDING: { label: "بانتظار الاستلام", cls: "bg-zinc-100 text-zinc-600" },
    PARTIALLY_RECEIVED: { label: "استلام جزئي", cls: "bg-amber-100 text-amber-700" },
    RECEIVED: { label: "مستلمة", cls: "bg-emerald-100 text-emerald-700" },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}
