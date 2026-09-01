"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { toast } from "sonner";
import type { BrandDto } from "@/services/catalog.service";
import {
  createBrandAction,
  updateBrandAction,
  deactivateBrandAction,
} from "@/actions/catalog-actions";
import { cn } from "@/lib/utils";

type DialogState = { kind: "create" } | { kind: "edit"; item: BrandDto } | null;

export function BrandsManager({
  brands,
  canManage,
}: {
  brands: BrandDto[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">العلامات التجارية</h1>
          <p className="text-sm text-muted-foreground">
            إدارة العلامات التجارية للمنتجات
          </p>
        </div>
        {canManage ? (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon className="size-4" aria-hidden />
            علامة جديدة
          </Button>
        ) : null}
      </div>

      <div className="rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>الاسم</TableHead>
              <TableHead>عدد المنتجات</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  لا توجد علامات تجارية بعد.
                </TableCell>
              </TableRow>
            ) : (
              brands.map((item) => (
                <BrandRow key={item.id} item={item} canManage={canManage} onEdit={() => setDialog({ kind: "edit", item })} onChanged={refresh} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog?.kind === "create"} onOpenChange={(open) => setDialog(open ? { kind: "create" } : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء علامة تجارية</DialogTitle>
            <DialogDescription>أدخل اسم العلامة التجارية</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" ? <BrandForm onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "edit"} onOpenChange={(open) => setDialog(open && dialog?.kind === "edit" ? dialog : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل العلامة التجارية</DialogTitle>
            <DialogDescription>تحديث اسم العلامة التجارية</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "edit" ? <BrandForm item={dialog.item} onSuccess={refresh} /> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BrandRow({
  item,
  canManage,
  onEdit,
  onChanged,
}: {
  item: BrandDto;
  canManage: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const deactivate = () => {
    startTransition(async () => {
      const result = await deactivateBrandAction(item.id);
      if (result.success) {
        toast.success("تم تعطيل العلامة التجارية");
        onChanged();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{item.name}</TableCell>
      <TableCell className="text-muted-foreground">{item.productCount}</TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            item.active ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600",
          )}
        >
          {item.active ? "نشطة" : "معطلة"}
        </span>
      </TableCell>
      <TableCell className="text-end">
        {canManage ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label={`إجراءات ${item.name}`}>
              <MoreHorizontalIcon className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <PencilIcon className="size-4" aria-hidden />
                تعديل
              </DropdownMenuItem>
              {item.active ? (
                <DropdownMenuItem onClick={deactivate} disabled={pending}>
                  <Trash2Icon className="size-4" aria-hidden />
                  تعطيل
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function BrandForm({ item, onSuccess }: { item?: BrandDto; onSuccess: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [actionError, setActionError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setActionError(undefined);
    startTransition(async () => {
      const input = { name };
      const result = item
        ? await updateBrandAction(item.id, input)
        : await createBrandAction(input);
      if (result.success) {
        toast.success(item ? "تم تعديل العلامة التجارية" : "تم إنشاء العلامة التجارية");
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
      <div className="grid gap-1.5">
        <Label htmlFor="brand-name">اسم العلامة التجارية</Label>
        <Input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: بيبسي"
        />
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
