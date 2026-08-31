"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ExpiryBatchDto } from "@/services/inventory.service";
import { disposeExpiredAction } from "@/actions/inventory-actions";
import { cn } from "@/lib/utils";

export function ExpiryView({
  batches,
  canDispose,
}: {
  batches: ExpiryBatchDto[];
  canDispose: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const expired = batches.filter((b) => b.status === "expired");
  const expiring = batches.filter((b) => b.status === "expiring");

  const dispose = (batchId: string) => {
    startTransition(async () => {
      const result = await disposeExpiredAction({ batchId });
      if (result.success) {
        toast.success("تم التخلص من الدفعة المنتهية");
        router.refresh();
      } else if (result.error) {
        toast.error(result.error);
      }
    });
  };

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-xl font-bold">انتهاء الصلاحية</h1>
        <p className="text-sm text-muted-foreground">
          مراقبة البضائع المنتهية والقريبة من الانتهاء
        </p>
      </div>

      {batches.length === 0 ? (
        <div className="rounded-lg border bg-background p-10 text-center text-muted-foreground">
          لا توجد بضائع منتهية أو قريبة من الانتهاء. كل شيء سليم.
        </div>
      ) : (
        <>
          <Section
            title={`بضائع منتهية الصلاحية (${expired.length})`}
            tone="danger"
          >
            <BatchTable
              batches={expired}
              canDispose={canDispose}
              pending={pending}
              onDispose={dispose}
            />
          </Section>
          <Section title={`توشك على الانتهاء (${expiring.length})`} tone="warning">
            <BatchTable batches={expiring} canDispose={false} pending={false} onDispose={() => {}} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "danger" | "warning";
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-3">
      <h2
        className={cn(
          "font-heading text-base font-bold",
          tone === "danger" ? "text-destructive" : "text-amber-600",
        )}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

function BatchTable({
  batches,
  canDispose,
  pending,
  onDispose,
}: {
  batches: ExpiryBatchDto[];
  canDispose: boolean;
  pending: boolean;
  onDispose: (batchId: string) => void;
}) {
  if (batches.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        لا توجد عناصر في هذا القسم
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>المنتج</TableHead>
            <TableHead>رمز الدفعة</TableHead>
            <TableHead>الكمية</TableHead>
            <TableHead>تاريخ الانتهاء</TableHead>
            <TableHead>الأيام المتبقية</TableHead>
            {canDispose ? <TableHead className="text-end">إجراءات</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {batches.map((b) => (
            <TableRow key={b.batchId}>
              <TableCell className="font-medium">{b.productName}</TableCell>
              <TableCell className="text-muted-foreground" dir="ltr">
                {b.batchCode || "—"}
              </TableCell>
              <TableCell>{b.quantity}</TableCell>
              <TableCell className="text-muted-foreground">{formatDate(b.expiryDate)}</TableCell>
              <TableCell>
                <span className={cn("font-semibold", b.status === "expired" ? "text-destructive" : "text-amber-600")}>
                  {b.status === "expired" ? "منتهية" : `خلال ${b.daysRemaining} يوم`}
                </span>
              </TableCell>
              {canDispose ? (
                <TableCell className="text-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDispose(b.batchId)}
                    disabled={pending || b.status !== "expired"}
                  >
                    {pending ? (
                      <Loader2Icon className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2Icon className="size-4" aria-hidden />
                    )}
                    التخلص منها
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
