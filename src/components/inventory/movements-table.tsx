"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MovementDto } from "@/services/inventory.service";
import { cn } from "@/lib/utils";

interface ProductOption {
  id: string;
  name: string;
}

export function MovementsTable({
  movements,
  total,
  page,
  pageSize,
  productFilter,
  typeFilter,
  movementLabels,
  products,
}: {
  movements: MovementDto[];
  total: number;
  page: number;
  pageSize: number;
  productFilter?: string;
  typeFilter?: string;
  movementLabels: Record<string, string>;
  products: ProductOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const update = (patch: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.set("page", "1");
    router.replace(`/inventory/movements?${params.toString()}`);
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-xl font-bold">حركات المخزون</h1>
        <p className="text-sm text-muted-foreground">
          سجل كامل وموثّق لجميع التغيرات في المخزون
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Select value={productFilter ?? ""} onValueChange={(v) => update({ product: v || undefined })}>
          <SelectTrigger aria-label="تصفية حسب المنتج">
            <SelectValue placeholder="كل المنتجات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل المنتجات</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter ?? ""} onValueChange={(v) => update({ type: v || undefined })}>
          <SelectTrigger aria-label="تصفية حسب نوع الحركة">
            <SelectValue placeholder="كل أنواع الحركات" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">كل الأنواع</SelectItem>
            {Object.entries(movementLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>التاريخ</TableHead>
              <TableHead>المنتج</TableHead>
              <TableHead>النوع</TableHead>
              <TableHead>الكمية</TableHead>
              <TableHead>السبب / الملاحظة</TableHead>
              <TableHead>بواسطة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {movements.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  لا توجد حركات مطابقة
                </TableCell>
              </TableRow>
            ) : (
              movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {formatDate(m.createdAt)}
                  </TableCell>
                  <TableCell className="font-medium">{m.productName}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        m.type === "ADJUSTMENT" && "bg-sky-100 text-sky-700",
                        m.type === "STOCK_COUNT" && "bg-violet-100 text-violet-700",
                        (m.type === "DAMAGE" || m.type === "EXPIRY") && "bg-rose-100 text-rose-700",
                        !["ADJUSTMENT", "STOCK_COUNT", "DAMAGE", "EXPIRY"].includes(m.type) && "bg-zinc-100 text-zinc-600",
                      )}
                    >
                      {movementLabels[m.type] ?? m.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className={cn("font-semibold", m.quantity > 0 ? "text-emerald-700" : "text-destructive")}>
                      {m.quantity > 0 ? "+" : ""}
                      {m.quantity}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.reason || "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.actorUsername || "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          عرض {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} من {total}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
            <ChevronRightIcon className="size-4" aria-hidden />
            <span className="sr-only">السابق</span>
          </Button>
          <span className="px-3 text-sm text-muted-foreground">الصفحة {page}</span>
          <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>
            <ChevronLeftIcon className="size-4" aria-hidden />
            <span className="sr-only">التالي</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
