"use client";

import Link from "next/link";
import { ShoppingCartIcon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProductStockSummary } from "@/services/inventory.service";

export function ReplenishmentView({
  rows,
}: {
  rows: ProductStockSummary[];
}) {
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-xl font-bold">إعادة التخزين</h1>
        <p className="text-sm text-muted-foreground">
          مقترحات لإعادة رفع المخزون المنخفض إلى الحد الأدنى
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">
          <ShoppingCartIcon className="mx-auto mb-3 size-8" aria-hidden />
          لا توجد مقترحات إعادة تخزين حاليًا. جميع المنتجات فوق الحد الأدنى.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>المنتج</TableHead>
                <TableHead>المتوفر</TableHead>
                <TableHead>الحد الأدنى</TableHead>
                <TableHead>الكمية المقترحة للطلب</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Link href={`/products/${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                  </TableCell>
                  <TableCell className="font-semibold text-amber-600">
                    {r.sellable} {r.unit}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.minimumStock}</TableCell>
                  <TableCell className="font-semibold">{r.suggested}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
