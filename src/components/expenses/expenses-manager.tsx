"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarIcon,
  CirclePlusIcon,
  Loader2Icon,
  PlusIcon,
  Settings2Icon,
  Trash2Icon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { PAYMENT_METHODS, paymentMethodLabel, type PaymentMethod } from "@/lib/sales/constants";
import type { ExpenseCategoryDto, ExpenseDto } from "@/services/expense.service";
import {
  createExpenseAction,
  listExpensesAction,
  createExpenseCategoryAction,
  setExpenseCategoryActiveAction,
  listExpenseCategoriesAction,
} from "@/actions/expense-actions";
import { cn } from "@/lib/utils";

function formatEgp(amount: number): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ج.م`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" });
}

export function ExpensesManager({
  initialExpenses,
  initialTotal,
  initialPage,
  pageSize,
  categories,
  openShiftId,
  canCreate,
  canManageCategories,
  canViewAccounting,
}: {
  initialExpenses: ExpenseDto[];
  initialTotal: number;
  initialPage: number;
  pageSize: number;
  categories: ExpenseCategoryDto[];
  openShiftId: string | null;
  canCreate: boolean;
  canManageCategories: boolean;
  canViewAccounting: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialExpenses);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const refresh = (
    p: number,
    opts: { cat?: string; from?: string; to?: string } = {},
  ) => {
    startTransition(async () => {
      const result = await listExpensesAction({
        page: p,
        pageSize,
        categoryId: opts.cat && opts.cat !== "all" ? opts.cat : undefined,
        dateFrom: opts.from || undefined,
        dateTo: opts.to || undefined,
      });
      setRows(result.items);
      setTotal(result.total);
      setPage(result.page);
    });
  };

  const applyFilters = () => {
    setPage(1);
    refresh(1, { cat: categoryFilter, from: dateFrom, to: dateTo });
  };

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setCategoryFilter("all");
    refresh(1, {});
  };

  const onCreated = () => {
    setCreateOpen(false);
    toast.success("تم تسجيل المصروف بنجاح");
    router.refresh();
    refresh(1, { cat: categoryFilter, from: dateFrom, to: dateTo });
  };

  const periodTotal = rows.reduce((s, r) => s + r.amount, 0);
  const periodCash = rows.filter((r) => r.paymentMethod === "CASH").reduce((s, r) => s + r.amount, 0);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المصروفات</h1>
          <p className="text-sm text-muted-foreground">تسجيل مصروفات التشغيل ومتابعة الإنفاق النقدي وغير النقدي</p>
        </div>
        <div className="flex items-center gap-2">
          {canViewAccounting ? (
            <Button variant="outline" render={<Link href="/accounting" />}>
              عرض المحاسبة
            </Button>
          ) : null}
          {canManageCategories ? (
            <Button variant="outline" onClick={() => setCatsOpen(true)}>
              <Settings2Icon className="size-4" aria-hidden />
              الفئات
            </Button>
          ) : null}
          {canCreate ? (
            <Button onClick={() => setCreateOpen(true)}>
              <PlusIcon className="size-4" aria-hidden />
              مصروف جديد
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">إجمالي في هذه الصفحة</p>
          <p className="mt-1 text-2xl font-bold">{formatEgp(periodTotal)}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">نقدي في هذه الصفحة</p>
          <p className="mt-1 text-2xl font-bold">{formatEgp(periodCash)}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">عدد المصروفات</p>
          <p className="mt-1 text-2xl font-bold">{total.toLocaleString("ar-EG")}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-3">
        <div className="grid gap-1.5">
          <Label htmlFor="exp-from">من تاريخ</Label>
          <Input id="exp-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exp-to">إلى تاريخ</Label>
          <Input id="exp-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>الفئة</Label>
          <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v ?? "all")}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="كل الفئات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الفئات</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={applyFilters} disabled={pending}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          <SearchIcon className="size-4" aria-hidden />
          بحث
        </Button>
        <Button variant="ghost" onClick={clearFilters} disabled={pending}>
          مسح
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>رقم المصروف</TableHead>
              <TableHead>الفئة</TableHead>
              <TableHead>المبلغ</TableHead>
              <TableHead>طريقة الدفع</TableHead>
              <TableHead>التاريخ</TableHead>
              <TableHead>الملاحظات</TableHead>
              <TableHead>المسجل بواسطة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <Loader2Icon className="mx-auto size-5 animate-spin" aria-hidden />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  لا توجد مصروفات مطابقة
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs" dir="ltr">{r.expenseNumber}</TableCell>
                  <TableCell className="font-medium">{r.categoryName}</TableCell>
                  <TableCell>
                    <span className={cn("font-semibold", r.paymentMethod === "CASH" ? "text-amber-600" : "text-foreground")}>
                      {formatEgp(r.amount)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{paymentMethodLabel(r.paymentMethod)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(r.expenseDate)}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-muted-foreground" title={r.notes}>{r.notes || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{r.createdBy || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <p>
          صفحة {page.toLocaleString("ar-EG")} من {pageCount.toLocaleString("ar-EG")}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || pending} onClick={() => refresh(page - 1, { cat: categoryFilter, from: dateFrom, to: dateTo })}>
            السابق
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pageCount || pending}
            onClick={() => refresh(page + 1, { cat: categoryFilter, from: dateFrom, to: dateTo })}
          >
            التالي
          </Button>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تسجيل مصروف</DialogTitle>
            <DialogDescription>أدخل تفاصيل المصروف. المبالغ تُسجَّل كمعاملات مالية.</DialogDescription>
          </DialogHeader>
          {createOpen ? (
            <ExpenseForm
              categories={categories}
              openShiftId={openShiftId}
              onSuccess={onCreated}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {canManageCategories ? (
        <Dialog open={catsOpen} onOpenChange={setCatsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>فئات المصروفات</DialogTitle>
              <DialogDescription>إدارة المصروفات وتفعيلها أو تعطيلها. لا تُحذف الفئات أبدًا.</DialogDescription>
            </DialogHeader>
            {catsOpen ? <CategoryManager initial={categories} onChanged={() => router.refresh()} /> : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function ExpenseForm({
  categories,
  openShiftId,
  onSuccess,
}: {
  categories: ExpenseCategoryDto[];
  openShiftId: string | null;
  onSuccess: () => void;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [date, setDate] = useState("");
  const [linkToShift, setLinkToShift] = useState(false);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const activeCategories = categories.filter((c) => c.active || c.id === categoryId);

  const submit = () => {
    setActionError(undefined);
    const amountNum = Number(amount);
    if (!categoryId) {
      setActionError("اختر فئة المصروف");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setActionError("أدخل مبلغًا صحيحًا أكبر من صفر");
      return;
    }
    const idempotencyKey =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `exp-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const input = {
      categoryId,
      amount: amountNum,
      paymentMethod,
      expenseDate: date || undefined,
      shiftId: linkToShift && openShiftId ? openShiftId : undefined,
      notes: notes.trim() || undefined,
      idempotencyKey,
    };

    startTransition(async () => {
      const result = await createExpenseAction(input);
      if (result.success) {
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
        <Label htmlFor="exp-cat">الفئة *</Label>
        <Select value={categoryId || undefined} onValueChange={(v) => setCategoryId(v ?? "")}>
          <SelectTrigger id="exp-cat">
            <SelectValue placeholder="اختر الفئة" />
          </SelectTrigger>
          <SelectContent>
            {activeCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeCategories.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا توجد فئات متاحة — أنشئ فئة أولًا من زر «الفئات».</p>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="exp-amount">المبلغ (ج.م) *</Label>
          <Input
            id="exp-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مثال: 250"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="exp-method">طريقة الدفع</Label>
          <Select value={paymentMethod} onValueChange={(v) => v && setPaymentMethod(v as PaymentMethod)}>
            <SelectTrigger id="exp-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {paymentMethodLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="exp-date">التاريخ</Label>
        <div className="relative">
          <CalendarIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="exp-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ps-9" />
        </div>
      </div>
      {openShiftId ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
          <div>
            <p className="text-sm font-medium">ربط بالوردية الحالية</p>
            <p className="text-xs text-muted-foreground">يُخصم المصروف النقدي من نهاية الوردية</p>
          </div>
          <Switch
            aria-label="ربط بالوردية الحالية"
            checked={linkToShift}
            onCheckedChange={setLinkToShift}
            disabled={paymentMethod !== "CASH"}
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="exp-notes">الملاحظات / الجهة</Label>
        <Textarea id="exp-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: فاتورة كهرباء" />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending || activeCategories.length === 0}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          تسجيل المصروف
        </Button>
      </div>
    </form>
  );
}

function CategoryManager({ initial, onChanged }: { initial: ExpenseCategoryDto[]; onChanged: () => void }) {
  const [items, setItems] = useState(initial);
  const [newName, setNewName] = useState("");
  const [pending, startTransition] = useTransition();
  const [createPending, startCreate] = useTransition();
  const [actionError, setActionError] = useState<string>();

  const toggle = (c: ExpenseCategoryDto) => {
    startTransition(async () => {
      const result = await setExpenseCategoryActiveAction(c.id, !c.active);
      if (result.success) {
        toast.success(c.active ? "تم تعطيل الفئة" : "تم تفعيل الفئة");
        const next = await listExpenseCategoriesAction();
        setItems(next);
        onChanged();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  const add = () => {
    setActionError(undefined);
    const name = newName.trim();
    if (!name) {
      setActionError("أدخل اسم الفئة");
      return;
    }
    startCreate(async () => {
      const result = await createExpenseCategoryAction({ name });
      if (result.success) {
        toast.success("تم إنشاء الفئة");
        setNewName("");
        const next = await listExpenseCategoriesAction();
        setItems(next);
        onChanged();
      } else if (result.error) {
        setActionError(result.error);
      }
    });
  };

  return (
    <div className="grid gap-4">
      {actionError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {actionError}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="اسم الفئة الجديدة"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button onClick={add} disabled={createPending}>
          {createPending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          <CirclePlusIcon className="size-4" aria-hidden />
          إضافة
        </Button>
      </div>
      <div className="grid gap-2">
        {items.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
            <span className={cn("text-sm font-medium", !c.active && "text-muted-foreground line-through")}>{c.name}</span>
            <Button variant="ghost" size="sm" onClick={() => toggle(c)} disabled={pending}>
              {c.active ? (
                <>
                  <Trash2Icon className="size-4" aria-hidden />
                  تعطيل
                </>
              ) : (
                <>
                  <CirclePlusIcon className="size-4" aria-hidden />
                  تفعيل
                </>
              )}
            </Button>
          </div>
        ))}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد فئات بعد.</p>
        ) : null}
      </div>
    </div>
  );
}
