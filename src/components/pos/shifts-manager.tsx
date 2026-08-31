"use client";

import { useCallback, useEffect, useState } from "react";
import { EyeIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
} from "@/components/ui/badge";
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
import { listShiftsAction, listShiftCashMovementsAction } from "@/actions/shift-actions";
import { listShiftSalesAction } from "@/actions/sales-actions";
import type { ShiftDto } from "@/services/shift.service";
import type { SaleDto } from "@/services/sales.service";
import { paymentMethodLabel } from "@/lib/sales/constants";
import { cn } from "@/lib/utils";

function formatEgp(n: number): string {
  return `${Math.round(n).toLocaleString("ar-EG")} ج.م`;
}

type Movement = {
  id: string;
  type: "CASH_IN" | "CASH_OUT" | "EXPENSE" | "ADJUSTMENT";
  amount: number;
  reason: string;
  createdAt: string;
};

const MOVEMENT_LABELS: Record<Movement["type"], string> = {
  CASH_IN: "إيداع نقدي",
  CASH_OUT: "سحب نقدي",
  EXPENSE: "مصروف نقدي",
  ADJUSTMENT: "تسوية نقدية",
};

export function ShiftsManager() {
  const [shifts, setShifts] = useState<ShiftDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ShiftDto | null>(null);
  const [sales, setSales] = useState<SaleDto[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    const rows = await listShiftsAction();
    setShifts(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    listShiftsAction().then((rows) => {
      if (cancelled) return;
      setShifts(rows);
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

  const openDetails = async (shift: ShiftDto) => {
    setSelected(shift);
    setDetailLoading(true);
    setSales([]);
    setMovements([]);
    const [s, m] = await Promise.all([
      listShiftSalesAction(shift.id),
      listShiftCashMovementsAction(shift.id),
    ]);
    setSales(s);
    setMovements(m);
    setDetailLoading(false);
  };

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-bold">الورديات</h1>
          <p className="text-sm text-muted-foreground">سجل ورديات الكاشير وتسوية الصندوق</p>
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
      ) : shifts.length === 0 ? (
        <p className="rounded-lg border bg-background p-10 text-center text-sm text-muted-foreground">
          لا توجد ورديات بعد
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>الافتتاح</TableHead>
                <TableHead>الفتح في</TableHead>
                <TableHead>الحالة</TableHead>
                <TableHead>عدد المبيعات</TableHead>
                <TableHead>النقد من المبيعات</TableHead>
                <TableHead>المتوقع</TableHead>
                <TableHead>الفعلي</TableHead>
                <TableHead>الفرق</TableHead>
                <TableHead className="text-end">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{formatEgp(s.openingCash)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(s.openedAt)}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
                  </TableCell>
                  <TableCell>{s.salesCount}</TableCell>
                  <TableCell>{formatEgp(s.cashSales)}</TableCell>
                  <TableCell>{s.expectedCash != null ? formatEgp(s.expectedCash) : "—"}</TableCell>
                  <TableCell>{s.actualCash != null ? formatEgp(s.actualCash) : "—"}</TableCell>
                  <TableCell>
                    {s.variance != null ? (
                      <span
                        className={cn(
                          "font-semibold",
                          s.variance < 0 ? "text-destructive" : s.variance > 0 ? "text-emerald-700" : undefined,
                        )}
                      >
                        {formatEgp(s.variance)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button variant="outline" size="sm" onClick={() => void openDetails(s)}>
                      <EyeIcon className="size-4" aria-hidden />
                      التفاصيل
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={selected !== null} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl" showCloseButton>
          <DialogHeader>
            <DialogTitle>تفاصيل الوردية</DialogTitle>
            <DialogDescription>مبيعات الوردية وحركات النقد</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="grid gap-4">
              <div className="grid gap-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-muted-foreground">الافتتاح: </span>
                  <span className="font-semibold">{formatEgp(selected.openingCash)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">الفتح في: </span>
                  <span className="font-semibold">{formatDate(selected.openedAt)}</span>
                </div>
                {selected.closedAt ? (
                  <div>
                    <span className="text-muted-foreground">الإغلاق في: </span>
                    <span className="font-semibold">{formatDate(selected.closedAt)}</span>
                  </div>
                ) : null}
                <div>
                  <span className="text-muted-foreground">الحالة: </span>
                  <StatusBadge status={selected.status} />
                </div>
                {selected.expectedCash != null ? (
                  <div>
                    <span className="text-muted-foreground">المتوقع: </span>
                    <span className="font-semibold">{formatEgp(selected.expectedCash)}</span>
                  </div>
                ) : null}
                {selected.actualCash != null ? (
                  <div>
                    <span className="text-muted-foreground">الفعلي: </span>
                    <span className="font-semibold">{formatEgp(selected.actualCash)}</span>
                  </div>
                ) : null}
                {selected.variance != null ? (
                  <div>
                    <span className="text-muted-foreground">الفرق: </span>
                    <span
                      className={cn(
                        "font-semibold",
                        selected.variance < 0 ? "text-destructive" : selected.variance > 0 ? "text-emerald-700" : undefined,
                      )}
                    >
                      {formatEgp(selected.variance)}
                    </span>
                  </div>
                ) : null}
                {selected.closingNote ? (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">الملاحظة: </span>
                    <span>{selected.closingNote}</span>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-3">
                <h3 className="font-heading text-sm font-bold">مبيعات الوردية</h3>
                {detailLoading ? (
                  <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
                ) : sales.length === 0 ? (
                  <p className="rounded-lg border bg-background p-4 text-center text-sm text-muted-foreground">
                    لا توجد مبيعات في هذه الوردية
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>رقم الفاتورة</TableHead>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>الإجمالي</TableHead>
                          <TableHead>طرق الدفع</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell className="font-medium" dir="ltr">{sale.invoiceNumber}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(sale.createdAt)}</TableCell>
                            <TableCell className="font-semibold">{formatEgp(sale.totalAmount)}</TableCell>
                            <TableCell>{sale.payments.map((p) => paymentMethodLabel(p.method)).join("، ")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="grid gap-3">
                <h3 className="font-heading text-sm font-bold">حركات النقد</h3>
                {detailLoading ? (
                  <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
                ) : movements.length === 0 ? (
                  <p className="rounded-lg border bg-background p-4 text-center text-sm text-muted-foreground">
                    لا توجد حركات نقد في هذه الوردية
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border bg-background">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>النوع</TableHead>
                          <TableHead>المبلغ</TableHead>
                          <TableHead>السبب</TableHead>
                          <TableHead>التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {movements.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell>
                              <Badge variant="outline">{MOVEMENT_LABELS[m.type] ?? m.type}</Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                "font-semibold",
                                m.type === "CASH_IN" ? "text-emerald-700" : "text-destructive",
                              )}
                            >
                              {m.type === "CASH_IN" ? "+" : "-"}
                              {formatEgp(m.amount)}
                            </TableCell>
                            <TableCell>{m.reason}</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(m.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ShiftDto["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "OPEN" && "bg-emerald-100 text-emerald-700",
        status === "CLOSED" && "bg-zinc-100 text-zinc-600",
        status === "REVIEW_REQUIRED" && "bg-amber-100 text-amber-700",
      )}
    >
      {status === "OPEN" ? "مفتوحة" : status === "CLOSED" ? "مغلقة" : "مراجعة"}
    </Badge>
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
