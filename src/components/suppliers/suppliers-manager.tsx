"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { SupplierDto } from "@/services/supplier.service";
import {
  createSupplierAction,
  updateSupplierAction,
  setSupplierActiveAction,
} from "@/actions/supplier-actions";
import { cn } from "@/lib/utils";

type DialogState = { kind: "create" } | { kind: "edit"; item: SupplierDto } | null;

function formatEgp(amount: number): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ج.م`;
}

export function SuppliersManager({
  suppliers,
  canCreate,
  canUpdate,
  canDisable,
  canViewLedger,
}: {
  suppliers: SupplierDto[];
  canCreate: boolean;
  canUpdate: boolean;
  canDisable: boolean;
  canViewLedger: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [q, setQ] = useState("");
  const [togglePending, startToggle] = useTransition();

  const toggleActive = (s: SupplierDto) => {
    startToggle(async () => {
      const result = await setSupplierActiveAction(s.id, !s.active);
      if (result.success) {
        toast.success(s.active ? "تم تعطيل المورد" : "تم تفعيل المورد");
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  const filtered = q.trim()
    ? suppliers.filter((s) => s.name.includes(q) || s.company.includes(q) || s.phone.includes(q))
    : suppliers;

  const totalBalance = suppliers.reduce((s, x) => s + x.balance, 0);
  const suppliersOwed = suppliers.filter((s) => s.balance > 0).length;

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">الموردون</h1>
          <p className="text-sm text-muted-foreground">
            إدارة الموردين وأرصدتهم المستحقة
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon className="size-4" aria-hidden />
            مورد جديد
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">إجمالي المستحق للموردين</p>
          <p className="mt-1 text-2xl font-bold">{formatEgp(totalBalance)}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">موردين مستحق لهم</p>
          <p className="mt-1 text-2xl font-bold">{suppliersOwed}</p>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الشركة أو الهاتف" className="ps-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المورد</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>الرصيد المستحق</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  لا توجد موردين مطابقين
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/suppliers/${s.id}`} className="font-medium hover:underline">
                      {s.name}
                    </Link>
                    {s.company ? <p className="text-xs text-muted-foreground">{s.company}</p> : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground" dir="ltr">{s.phone || "—"}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "font-semibold",
                        s.balance > 0 ? "text-amber-600" : "text-emerald-700",
                      )}
                    >
                      {formatEgp(s.balance)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        s.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                      )}
                    >
                      {s.active ? "نشط" : "معطل"}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      {canViewLedger ? (
                        <Button variant="outline" size="sm" render={<Link href={`/suppliers/${s.id}`} />}>
                          التفاصيل
                        </Button>
                      ) : null}
                      {canUpdate || canDisable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label={`إجراءات ${s.name}`}>
                            <MoreHorizontalIcon className="size-4" aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdate ? (
                              <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", item: s })}>
                                <PencilIcon className="size-4" aria-hidden />
                                تعديل
                              </DropdownMenuItem>
                            ) : null}
                            {canDisable ? (
                              <DropdownMenuItem onSelect={() => toggleActive(s)} disabled={togglePending}>
                                <Trash2Icon className="size-4" aria-hidden />
                                {s.active ? "تعطيل" : "تفعيل"}
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog?.kind === "create"} onOpenChange={(open) => setDialog(open ? { kind: "create" } : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>إنشاء مورد جديد</DialogTitle>
            <DialogDescription>أدخل بيانات المورد</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" ? <SupplierForm onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "edit"} onOpenChange={(open) => setDialog(open && dialog?.kind === "edit" ? dialog : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل المورد</DialogTitle>
            <DialogDescription>تحديث بيانات المورد</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "edit" ? <SupplierForm item={dialog.item} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SupplierForm({ item, onSuccess }: { item?: SupplierDto; onSuccess: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [company, setCompany] = useState(item?.company ?? "");
  const [phone, setPhone] = useState(item?.phone ?? "");
  const [email, setEmail] = useState(item?.email ?? "");
  const [address, setAddress] = useState(item?.address ?? "");
  const [paymentTerms, setPaymentTerms] = useState(item?.paymentTerms ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setActionError(undefined);
    const input = { name, company, phone, email, address, paymentTerms, notes };
    startTransition(async () => {
      const result = item
        ? await updateSupplierAction(item.id, input)
        : await createSupplierAction(input);
      if (result.success) {
        toast.success(item ? "تم تعديل المورد" : "تم إنشاء المورد");
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
        <Label htmlFor="sup-name">اسم المورد *</Label>
        <Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شركة الأمل" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-company">الشركة</Label>
        <Input id="sup-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="اسم الشركة (اختياري)" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="sup-phone">الهاتف</Label>
          <Input id="sup-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sup-email">البريد الإلكتروني</Label>
          <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-address">العنوان</Label>
        <Input id="sup-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-terms">شروط الدفع</Label>
        <Input id="sup-terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="مثال: نقدي / آجل 30 يوم" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="sup-notes">ملاحظات</Label>
        <Textarea id="sup-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={pending || name.trim() === ""}>
          {pending && <Loader2Icon className="size-4 animate-spin" aria-hidden />}
          {item ? "حفظ" : "إنشاء"}
        </Button>
      </div>
    </form>
  );
}
