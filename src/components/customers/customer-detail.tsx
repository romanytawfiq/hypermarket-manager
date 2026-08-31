"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BanknoteIcon, Loader2Icon } from "lucide-react";
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
import { toast } from "sonner";
import type { CustomerDto, CustomerLedgerDto, CustomerPaymentDto } from "@/services/customer.service";
import { createCustomerPaymentAction } from "@/actions/customer-actions";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

function formatEgp(amount: number): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ج.م`;
}

const LEDGER_LABELS: Record<string, string> = {
  CREDIT_SALE: "بيع آجل",
  PAYMENT: "دفعة",
  ADJUSTMENT: "تسوية",
};

export function CustomerDetail({
  customer,
  ledger,
  payments,
  canCollect,
  canUpdate,
}: {
  customer: CustomerDto;
  ledger: CustomerLedgerDto[];
  payments: CustomerPaymentDto[];
  canCollect: boolean;
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [payOpen, setPayOpen] = useState(false);
  const [filter, setFilter] = useState<"ledger" | "payments">("ledger");

  const refresh = () => {
    setPayOpen(false);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/customers" className="text-sm text-muted-foreground hover:underline">
            → العملاء
          </Link>
          <h1 className="mt-1 font-heading text-xl font-bold">{customer.name}</h1>
          {customer.phone || customer.email ? (
            <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
              {customer.phone}{customer.phone && customer.email ? " · " : ""}{customer.email}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canCollect ? (
            <Button variant="outline" onClick={() => setPayOpen(true)} disabled={customer.balance <= 0}>
              <BanknoteIcon className="size-4" aria-hidden />
              تحصيل دفعة
            </Button>
          ) : null}
        </div>
      </div>

      {/* Balance card */}
      <div className="rounded-lg border bg-background p-5">
        <p className="text-sm text-muted-foreground">الرصيد المستحق</p>
        <p className={`mt-1 text-3xl font-bold ${customer.balance > 0 ? "text-amber-600" : "text-emerald-700"}`}>
          {formatEgp(customer.balance)}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>حالة: {customer.active ? "نشط" : "معطل"}</span>
          <span>البيع على الحساب: {customer.allowCredit ? "مسموح" : "ممنوع"}</span>
          <span>حد الائتمان: {customer.creditLimit == null ? "بدون حد" : formatEgp(customer.creditLimit)}</span>
        </div>
      </div>

      {(customer.address || customer.notes) ? (
        <div className="rounded-lg border bg-background p-4 text-sm">
          {customer.address ? <p><span className="text-muted-foreground">العنوان: </span>{customer.address}</p> : null}
          {customer.notes ? <p className="mt-1 text-muted-foreground">{customer.notes}</p> : null}
        </div>
      ) : null}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(["ledger", "payments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              filter === t
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "ledger" ? "كشف الحساب" : "المدفوعات"}
          </button>
        ))}
      </div>

      {filter === "ledger" ? <LedgerTable ledger={ledger} /> : <PaymentsTable payments={payments} />}

      {canUpdate ? (
        <p className="text-xs text-muted-foreground">
          لتعديل بيانات العميل، ارجع إلى قائمة العملاء واختر «تعديل».
        </p>
      ) : null}

      {/* Collect payment dialog */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تحصيل دفعة من العميل</DialogTitle>
            <DialogDescription>
              {customer.name} — الرصيد المستحق: {formatEgp(customer.balance)}
            </DialogDescription>
          </DialogHeader>
          {payOpen ? <CollectPaymentForm customerId={customer.id} balance={customer.balance} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LedgerTable({ ledger }: { ledger: CustomerLedgerDto[] }) {
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

function PaymentsTable({ payments }: { payments: CustomerPaymentDto[] }) {
  if (payments.length === 0) {
    return <EmptyTable message="لا توجد مدفوعات مسجلة بعد" />;
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>الرقم</TableHead>
            <TableHead>التاريخ</TableHead>
            <TableHead>الطريقة</TableHead>
            <TableHead>المبلغ</TableHead>
            <TableHead>المسجِّل</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium">{p.paymentNumber}</TableCell>
              <TableCell className="text-muted-foreground">{new Date(p.paymentDate).toLocaleDateString("ar-EG")}</TableCell>
              <TableCell>{PAYMENT_METHOD_LABELS[p.method as PaymentMethod] ?? p.method}</TableCell>
              <TableCell className="font-semibold text-emerald-700">{formatEgp(p.amount)}</TableCell>
              <TableCell className="text-muted-foreground">{p.createdBy}</TableCell>
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

function CollectPaymentForm({
  customerId,
  balance,
  onSuccess,
}: {
  customerId: string;
  balance: number;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const amountNum = amount ? Number(amount) : NaN;

  const submit = () => {
    setActionError(undefined);
    if (!(amountNum > 0)) {
      setActionError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    if (amountNum > balance + 0.01) {
      setActionError("المبلغ يتجاوز الرصيد المستحق");
      return;
    }
    startTransition(async () => {
      const result = await createCustomerPaymentAction({
        customerId,
        amount: amountNum,
        method,
        idempotencyKey: crypto.randomUUID(),
      });
      if (result.success) {
        toast.success("تم تسجيل الدفعة بنجاح");
        onSuccess();
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
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label>طريقة الدفع</Label>
        <div className="grid grid-cols-3 gap-2">
          {PAYMENT_METHODS.map((m) => (
            <Button
              key={m}
              type="button"
              variant={method === m ? "secondary" : "outline"}
              size="sm"
              onClick={() => setMethod(m)}
            >
              {PAYMENT_METHOD_LABELS[m]}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="cp-amount">المبلغ (المتاح: {formatEgp(balance)})</Label>
        <Input
          id="cp-amount"
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
        />
      </div>

      <Button type="submit" disabled={pending || !(amountNum > 0)} className={cn("w-full")}>
        {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
        تسجيل الدفعة
      </Button>
    </form>
  );
}
