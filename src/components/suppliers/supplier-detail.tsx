"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownLeftIcon,
  BanknoteIcon,
  PackagePlusIcon,
  Undo2Icon,
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
import type { SupplierDto } from "@/services/supplier.service";
import type { PurchaseDto } from "@/services/purchasing.service";
import type { ProductDto } from "@/services/catalog.service";
import {
  CreatePurchaseForm,
  PaySupplierForm,
  ReceivePurchaseForm,
  SupplierReturnForm,
} from "@/components/suppliers/purchase-forms";

function formatEgp(amount: number): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ج.م`;
}

type DialogState =
  | { kind: "purchase" }
  | { kind: "pay" }
  | { kind: "receive"; purchase: PurchaseDto }
  | { kind: "return"; purchase: PurchaseDto }
  | null;

const LEDGER_LABELS: Record<string, string> = {
  PURCHASE: "شراء",
  PAYMENT: "دفعة",
  RETURN: "مرتجع",
  ADJUSTMENT: "تسوية",
};

export function SupplierDetail({
  supplier,
  ledger,
  payments,
  purchases,
  products,
  canPay,
  canReceive,
  canReturn,
  canCreatePurchase,
}: {
  supplier: SupplierDto;
  ledger: Awaited<ReturnType<typeof import("@/services/supplier.service").listSupplierLedger>>;
  payments: Awaited<ReturnType<typeof import("@/services/supplier.service").listSupplierPayments>>;
  purchases: PurchaseDto[];
  products: ProductDto[];
  canPay: boolean;
  canReceive: boolean;
  canReturn: boolean;
  canCreatePurchase: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [filter, setFilter] = useState<"purchases" | "payments" | "ledger">("purchases");

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/suppliers" className="text-sm text-muted-foreground hover:underline">
            → الموردون
          </Link>
          <h1 className="mt-1 font-heading text-xl font-bold">{supplier.name}</h1>
          {supplier.company ? <p className="text-sm text-muted-foreground">{supplier.company}</p> : null}
          {supplier.phone || supplier.email ? (
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {supplier.phone}{supplier.phone && supplier.email ? " · " : ""}{supplier.email}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreatePurchase ? (
            <Button onClick={() => setDialog({ kind: "purchase" })}>
              <PackagePlusIcon className="size-4" aria-hidden />
              تسجيل شراء
            </Button>
          ) : null}
          {canPay ? (
            <Button variant="outline" onClick={() => setDialog({ kind: "pay" })}>
              <BanknoteIcon className="size-4" aria-hidden />
              دفع مستحق
            </Button>
          ) : null}
        </div>
      </div>

      {/* Balance card */}
      <div className="rounded-lg border bg-background p-5">
        <p className="text-sm text-muted-foreground">الرصيد المستحق</p>
        <p className={`mt-1 text-3xl font-bold ${supplier.balance > 0 ? "text-amber-600" : "text-emerald-700"}`}>
          {formatEgp(supplier.balance)}
        </p>
        {supplier.paymentTerms ? (
          <p className="mt-1 text-xs text-muted-foreground">شروط الدفع: {supplier.paymentTerms}</p>
        ) : null}
      </div>

      {(supplier.address || supplier.notes) ? (
        <div className="rounded-lg border bg-background p-4 text-sm">
          {supplier.address ? <p><span className="text-muted-foreground">العنوان: </span>{supplier.address}</p> : null}
          {supplier.notes ? <p className="mt-1 text-muted-foreground">{supplier.notes}</p> : null}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["purchases", "payments", "ledger"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              filter === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "purchases" ? "المشتريات" : t === "payments" ? "المدفوعات" : "الحركات المالية"}
          </button>
        ))}
      </div>

      {filter === "purchases" ? <PurchasesTable purchases={purchases} canReceive={canReceive} canReturn={canReturn} onReceive={(p) => setDialog({ kind: "receive", purchase: p })} onReturn={(p) => setDialog({ kind: "return", purchase: p })} /> : null}
      {filter === "payments" ? <PaymentsTable payments={payments} /> : null}
      {filter === "ledger" ? <LedgerTable ledger={ledger} /> : null}

      {/* Dialogs */}
      <Dialog open={dialog?.kind === "purchase"} onOpenChange={(open) => setDialog(open ? { kind: "purchase" } : null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل شراء جديد</DialogTitle>
            <DialogDescription>{supplier.name}</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "purchase" ? (
            <CreatePurchaseForm supplierId={supplier.id} supplierName={supplier.name} products={products} onSuccess={refresh} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "pay"} onOpenChange={(open) => setDialog(open ? { kind: "pay" } : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>دفع مستحق للمورد</DialogTitle>
            <DialogDescription>{supplier.name}</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "pay" ? <PaySupplierForm supplierId={supplier.id} onSuccess={refresh} /> : null}
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

function PurchasesTable({
  purchases,
  canReceive,
  canReturn,
  onReceive,
  onReturn,
}: {
  purchases: PurchaseDto[];
  canReceive: boolean;
  canReturn: boolean;
  onReceive: (p: PurchaseDto) => void;
  onReturn: (p: PurchaseDto) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الرقم</TableHead>
            <TableHead>التاريخ</TableHead>
            <TableHead>الإجمالي</TableHead>
            <TableHead>الحالة</TableHead>
            {canReceive || canReturn ? <TableHead className="text-end">إجراءات</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {purchases.length === 0 ? (
            <TableRow>
              <TableCell colSpan={canReceive || canReturn ? 5 : 4} className="h-24 text-center text-muted-foreground">
                لا توجد مشتريات مسجلة بعد
              </TableCell>
            </TableRow>
          ) : (
            purchases.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.purchaseNumber}</TableCell>
                <TableCell className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("ar-EG")}</TableCell>
                <TableCell className="font-semibold">{formatEgp(p.totalAmount)}</TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                {(canReceive || canReturn) ? (
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {canReceive && p.status !== "RECEIVED" ? (
                        <Button variant="outline" size="sm" onClick={() => onReceive(p)}>
                          <ArrowDownLeftIcon className="size-4" aria-hidden />
                          استلام
                        </Button>
                      ) : null}
                      {canReturn ? (
                        <Button variant="outline" size="sm" onClick={() => onReturn(p)}>
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
  );
}

function StatusBadge({ status }: { status: PurchaseDto["status"] }) {
  const map: Record<PurchaseDto["status"], { label: string; cls: string }> = {
    PENDING: { label: "بانتظار الاستلام", cls: "bg-zinc-100 text-zinc-600" },
    PARTIALLY_RECEIVED: { label: "استلام جزئي", cls: "bg-amber-100 text-amber-700" },
    RECEIVED: { label: "مستلمة", cls: "bg-emerald-100 text-emerald-700" },
  };
  const s = map[status] ?? map.PENDING;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

function PaymentsTable({
  payments,
}: {
  payments: Awaited<ReturnType<typeof import("@/services/supplier.service").listSupplierPayments>>;
}) {
  if (payments.length === 0) {
    return <EmptyTable message="لا توجد مدفوعات مسجلة بعد" />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>التاريخ</TableHead>
            <TableHead>الطريقة</TableHead>
            <TableHead>المبلغ</TableHead>
            <TableHead>المسجِّل</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="text-muted-foreground">{new Date(p.paymentDate).toLocaleDateString("ar-EG")}</TableCell>
              <TableCell>{p.method}</TableCell>
              <TableCell className="font-semibold text-emerald-700">{formatEgp(p.amount)}</TableCell>
              <TableCell className="text-muted-foreground">{p.createdBy}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LedgerTable({
  ledger,
}: {
  ledger: Awaited<ReturnType<typeof import("@/services/supplier.service").listSupplierLedger>>;
}) {
  if (ledger.length === 0) {
    return <EmptyTable message="لا توجد حركات مالية بعد" />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>التاريخ</TableHead>
            <TableHead>النوع</TableHead>
            <TableHead>الوصف</TableHead>
            <TableHead className="text-end">المبلغ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ledger.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="text-muted-foreground">{new Date(l.createdAt).toLocaleDateString("ar-EG")}</TableCell>
              <TableCell>{LEDGER_LABELS[l.type] ?? l.type}</TableCell>
              <TableCell className="text-muted-foreground">{l.description}</TableCell>
              <TableCell className={`text-end font-semibold ${l.amount >= 0 ? "text-amber-600" : "text-emerald-700"}`}>
                {l.amount >= 0 ? "+" : "-"}{formatEgp(Math.abs(l.amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyTable({ message }: { message: string }) {
  return (
    <div className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
