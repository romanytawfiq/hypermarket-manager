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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import type { CustomerDto } from "@/services/customer.service";
import {
  createCustomerAction,
  updateCustomerAction,
  setCustomerActiveAction,
} from "@/actions/customer-actions";
import { cn } from "@/lib/utils";

type DialogState = { kind: "create" } | { kind: "edit"; item: CustomerDto } | null;

function formatEgp(amount: number): string {
  return `${Math.round(amount).toLocaleString("ar-EG")} ج.م`;
}

export function CustomersManager({
  customers,
  canCreate,
  canUpdate,
  canDisable,
}: {
  customers: CustomerDto[];
  canCreate: boolean;
  canUpdate: boolean;
  canDisable: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);
  const [q, setQ] = useState("");
  const [togglePending, startToggle] = useTransition();

  const toggleActive = (c: CustomerDto) => {
    startToggle(async () => {
      const result = await setCustomerActiveAction(c.id, !c.active);
      if (result.success) {
        toast.success(c.active ? "تم تعطيل العميل" : "تم تفعيل العميل");
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  const filtered = q.trim()
    ? customers.filter((c) => c.name.includes(q) || c.phone.includes(q))
    : customers;

  const totalReceivable = customers.reduce((s, x) => s + x.balance, 0);
  const debtors = customers.filter((c) => c.balance > 0).length;

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">العملاء</h1>
          <p className="text-sm text-muted-foreground">
            إدارة العملاء وأرصدتهم المستحقة (المبيعات الآجلة)
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon className="size-4" aria-hidden />
            عميل جديد
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">إجمالي المستحقات على العملاء</p>
          <p className="mt-1 text-2xl font-bold">{formatEgp(totalReceivable)}</p>
        </div>
        <div className="rounded-lg border bg-background p-4">
          <p className="text-sm text-muted-foreground">عملاء عليهم مستحقات</p>
          <p className="mt-1 text-2xl font-bold">{debtors}</p>
        </div>
      </div>

      <div className="relative">
        <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الهاتف" className="ps-9" />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>العميل</TableHead>
              <TableHead>الهاتف</TableHead>
              <TableHead>الرصيد المستحق</TableHead>
              <TableHead>حد الائتمان</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  لا توجد عملاء مطابقين
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link href={`/customers/${c.id}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground" dir="ltr">{c.phone || "—"}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "font-semibold",
                        c.balance > 0 ? "text-amber-600" : "text-emerald-700",
                      )}
                    >
                      {formatEgp(c.balance)}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.creditLimit == null ? "بدون حد" : formatEgp(c.creditLimit)}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        c.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600",
                      )}
                    >
                      {c.active ? "نشط" : "معطل"}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="outline" size="sm" render={<Link href={`/customers/${c.id}`} />}>
                        التفاصيل
                      </Button>
                      {canUpdate || canDisable ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label={`إجراءات ${c.name}`}>
                            <MoreHorizontalIcon className="size-4" aria-hidden />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {canUpdate ? (
                              <DropdownMenuItem onSelect={() => setDialog({ kind: "edit", item: c })}>
                                <PencilIcon className="size-4" aria-hidden />
                                تعديل
                              </DropdownMenuItem>
                            ) : null}
                            {canDisable ? (
                              <DropdownMenuItem onSelect={() => toggleActive(c)} disabled={togglePending}>
                                <Trash2Icon className="size-4" aria-hidden />
                                {c.active ? "تعطيل" : "تفعيل"}
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
            <DialogTitle>إنشاء عميل جديد</DialogTitle>
            <DialogDescription>أدخل بيانات العميل</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" ? <CustomerForm onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "edit"} onOpenChange={(open) => setDialog(open && dialog?.kind === "edit" ? dialog : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>تعديل العميل</DialogTitle>
            <DialogDescription>تحديث بيانات العميل وحد الائتمان</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "edit" ? <CustomerForm item={dialog.item} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CustomerForm({ item, onSuccess }: { item?: CustomerDto; onSuccess: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [phone, setPhone] = useState(item?.phone ?? "");
  const [email, setEmail] = useState(item?.email ?? "");
  const [address, setAddress] = useState(item?.address ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [creditLimit, setCreditLimit] = useState(item?.creditLimit != null ? String(item.creditLimit) : "");
  const [allowCredit, setAllowCredit] = useState(item?.allowCredit ?? true);
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const parseLimit = (): number | null => {
    if (creditLimit.trim() === "") return null;
    const n = Number(creditLimit);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  };

  const submit = () => {
    setActionError(undefined);
    const limit = parseLimit();
    if (Number.isNaN(limit)) {
      setActionError("أدخل حد ائتمان صحيحًا أو اتركه فارغًا");
      return;
    }
    const input = { name, phone, email, address, notes, creditLimit: limit, allowCredit };
    startTransition(async () => {
      const result = item
        ? await updateCustomerAction(item.id, input)
        : await createCustomerAction(input);
      if (result.success) {
        toast.success(item ? "تم تعديل العميل" : "تم إنشاء العميل");
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
        <Label htmlFor="cust-name">اسم العميل *</Label>
        <Input id="cust-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: أحمد محمد" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cust-phone">الهاتف</Label>
          <Input id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cust-email">البريد الإلكتروني</Label>
          <Input id="cust-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="example@mail.com" />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cust-address">العنوان</Label>
        <Input id="cust-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="العنوان" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cust-limit">حد الائتمان (ج.م)</Label>
          <Input
            id="cust-limit"
            type="number"
            min={0}
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="بدون حد (فارغ)"
          />
        </div>
        <div className="flex items-end gap-2 pb-1">
          <Switch id="cust-credit" checked={allowCredit} onCheckedChange={setAllowCredit} />
          <Label htmlFor="cust-credit" className="cursor-pointer">سماح بالبيع على الحساب</Label>
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cust-notes">ملاحظات</Label>
        <Textarea id="cust-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
