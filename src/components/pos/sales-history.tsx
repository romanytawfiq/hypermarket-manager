"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeIcon, PrinterIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listSalesAction } from "@/actions/sales-actions";
import { paymentMethodLabel } from "@/lib/sales/constants";
import type { SaleDto } from "@/services/sales.service";
import { SaleReceiptDialog } from "@/components/printing/sale-receipt-dialog";

function formatEgp(n: number): string {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}

export function SalesHistory({ canPrint = true }: { canPrint?: boolean }) {
  const [sales, setSales] = useState<SaleDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SaleDto | null>(null);

  const load = useCallback(async () => {
    const rows = await listSalesAction();
    setSales(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSalesAction().then((rows) => {
      if (cancelled) return;
      setSales(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = () => {
    setLoading(true);
    void load();
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">المبيعات</h1>
          <p className="text-sm text-muted-foreground">سجل الفواتير الأخيرة</p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCwIcon className="size-4" aria-hidden />
          تحديث
        </Button>
      </div>

      {loading ? (
        <p className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
          جارٍ التحميل…
        </p>
      ) : sales.length === 0 ? (
        <p className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
          لا توجد مبيعات بعد
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>رقم الفاتورة</TableHead>
                <TableHead>التاريخ</TableHead>
                <TableHead>العميل</TableHead>
                <TableHead>عدد المنتجات</TableHead>
                <TableHead>الإجمالي</TableHead>
                <TableHead>طرق الدفع</TableHead>
                <TableHead className="text-end">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium" dir="ltr">
                    {s.invoiceNumber}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.createdAt)}</TableCell>
                  <TableCell>{s.customerName || "—"}</TableCell>
                  <TableCell>{s.items.reduce((sum, i) => sum + i.quantity, 0)}</TableCell>
                  <TableCell className="font-semibold">{formatEgp(s.totalAmount)}</TableCell>
                  <TableCell>{s.payments.map((p) => paymentMethodLabel(p.method)).join("، ")}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1.5">
                      {canPrint ? (
                        <Button
                          variant="outline"
                          size="sm"
                          title="طباعة الفاتورة"
                          onClick={() =>
                            window.open(`/print/sale/${s.id}`, "_blank", "noopener,noreferrer")
                          }
                        >
                          <PrinterIcon className="size-4" aria-hidden />
                          طباعة
                        </Button>
                      ) : null}
                      <Button variant="outline" size="sm" onClick={() => setSelected(s)}>
                        <EyeIcon className="size-4" aria-hidden />
                        عرض
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>فاتورة البيع</DialogTitle>
            <DialogDescription>عرض تفاصيل الفاتورة وطباعتها</DialogDescription>
          </DialogHeader>
          {selected ? (
            <SaleReceiptDialog saleId={selected.id} canPrint={canPrint} onClose={() => setSelected(null)} />
          ) : null}
        </DialogContent>
      </Dialog>
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
