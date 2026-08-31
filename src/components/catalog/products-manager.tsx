"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  ShieldOffIcon,
  ShieldCheckIcon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ProductDto, CategoryDto, BrandDto } from "@/services/catalog.service";
import { setProductActiveAction } from "@/actions/catalog-actions";
import { cn } from "@/lib/utils";
import { CreateProductForm, EditProductForm } from "@/components/catalog/product-forms";

type DialogState = { kind: "create" } | { kind: "edit"; product: ProductDto } | null;

export function ProductsManager({
  items,
  total,
  page,
  pageSize,
  categories,
  brands,
  canCreate,
  canUpdate,
  canDisable,
}: {
  items: ProductDto[];
  total: number;
  page: number;
  pageSize: number;
  categories: CategoryDto[];
  brands: BrandDto[];
  canCreate: boolean;
  canUpdate: boolean;
  canDisable: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [dialog, setDialog] = useState<DialogState>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const updateParams = (patch: Record<string, string | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.set("page", "1");
    router.replace(`/products?${params.toString()}`);
  };

  const refresh = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المنتجات</h1>
          <p className="text-sm text-muted-foreground">
            إدارة المنتجات وأسعارها وتتبع المخزون
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setDialog({ kind: "create" })}>
            <PlusIcon className="size-4" aria-hidden />
            منتج جديد
          </Button>
        ) : null}
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            updateParams({ q });
          }}
        >
          <SearchIcon className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم أو الباركود أو SKU" className="ps-9" />
        </form>
        <Select value={searchParams.get("category") ?? ""} onValueChange={(v) => updateParams({ category: v })}>
          <SelectTrigger aria-label="تصفية حسب الفئة">
            <SelectValue placeholder="كل الفئات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل الفئات</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get("brand") ?? ""} onValueChange={(v) => updateParams({ brand: v })}>
          <SelectTrigger aria-label="تصفية حسب العلامة التجارية">
            <SelectValue placeholder="كل العلامات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل العلامات</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={searchParams.get("status") ?? "active"} onValueChange={(v) => updateParams({ status: v })}>
          <SelectTrigger aria-label="تصفية حسب الحالة">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">النشطة</SelectItem>
            <SelectItem value="inactive">المعطلة</SelectItem>
            <SelectItem value="all">الكل</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>المنتج</TableHead>
              <TableHead>الفئة</TableHead>
              <TableHead>سعر البيع</TableHead>
              <TableHead>المخزون المتاح</TableHead>
              <TableHead>الحد الأدنى</TableHead>
              <TableHead>الحالة</TableHead>
              <TableHead className="text-end">إجراءات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  لا توجد منتجات مطابقة. عدّل الفلاتر أو أنشئ منتجًا جديدًا.
                </TableCell>
              </TableRow>
            ) : (
              items.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  canUpdate={canUpdate}
                  canDisable={canDisable}
                  onEdit={() => setDialog({ kind: "edit", product })}
                  onChanged={refresh}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() => updateParams({ page: String(page - 1) })}
          >
            <ChevronRightIcon className="size-4" aria-hidden />
            <span className="sr-only">السابق</span>
          </Button>
          <span className="px-3 text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
          >
            <ChevronLeftIcon className="size-4" aria-hidden />
            <span className="sr-only">التالي</span>
          </Button>
        </div>
      </div>

      <Dialog open={dialog?.kind === "create"} onOpenChange={(open) => setDialog(open ? { kind: "create" } : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إنشاء منتج جديد</DialogTitle>
            <DialogDescription>أدخل بيانات المنتج الأساسية</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "create" ? (
            <CreateProductForm categories={categories} brands={brands} onSuccess={refresh} />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={dialog?.kind === "edit"} onOpenChange={(open) => setDialog(open && dialog?.kind === "edit" ? dialog : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تعديل المنتج</DialogTitle>
            <DialogDescription>تحديث بيانات المنتج</DialogDescription>
          </DialogHeader>
          {dialog?.kind === "edit" ? (
            <EditProductForm product={dialog.product} categories={categories} brands={brands} onSuccess={refresh} />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductRow({
  product,
  canUpdate,
  canDisable,
  onEdit,
  onChanged,
}: {
  product: ProductDto;
  canUpdate: boolean;
  canDisable: boolean;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const toggleActive = () => {
    startTransition(async () => {
      const result = await setProductActiveAction(product.id, !product.active);
      if (result.success) {
        toast.success(product.active ? "تم تعطيل المنتج" : "تم تفعيل المنتج");
        onChanged();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  const low = product.sellable !== null && product.sellable <= product.minimumStock;
  const out = product.sellable !== null && product.sellable <= 0;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
            <PackageIcon className="size-4 text-muted-foreground" aria-hidden />
          </span>
          <div>
            <Link href={`/products/${product.id}`} className="font-medium hover:underline">
              {product.name}
            </Link>
            {product.barcode || product.sku ? (
              <p className="text-xs text-muted-foreground" dir="ltr">
                {product.barcode ? `EAN ${product.barcode}` : `SKU ${product.sku}`}
              </p>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{product.categoryName || "—"}</TableCell>
      <TableCell className="font-medium">{formatMoney(product.sellingPrice)}</TableCell>
      <TableCell>
        <span className={cn("font-semibold", out ? "text-destructive" : low ? "text-amber-600" : "text-emerald-700")}>
          {product.sellable === null ? "—" : product.sellable}
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground">{product.minimumStock}</TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            !product.active
              ? "bg-zinc-100 text-zinc-600"
              : out
                ? "bg-rose-100 text-rose-700"
                : low
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700",
          )}
        >
          {!product.active ? "معطل" : out ? "نفد" : low ? "مخزون منخفض" : "متوفر"}
        </span>
      </TableCell>
      <TableCell className="text-end">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />} aria-label={`إجراءات ${product.name}`}>
            <MoreHorizontalIcon className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canUpdate ? (
              <DropdownMenuItem onSelect={onEdit}>
                <PencilIcon className="size-4" aria-hidden />
                تعديل
              </DropdownMenuItem>
            ) : null}
            {canDisable ? (
              <DropdownMenuItem onSelect={toggleActive} disabled={pending}>
                {product.active ? (
                  <>
                    <ShieldOffIcon className="size-4" aria-hidden />
                    تعطيل
                  </>
                ) : (
                  <>
                    <ShieldCheckIcon className="size-4" aria-hidden />
                    تفعيل
                  </>
                )}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(value);
}
