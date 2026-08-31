import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getProduct } from "@/services/catalog.service";
import {
  getSellableStock,
  listProductBatches,
  listMovements,
} from "@/services/inventory.service";
import { AppError } from "@/lib/errors";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: "تفاصيل المنتج — نكسا ريتيل",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = (await getCurrentUser())!;
  const { id } = await params;

  let product;
  try {
    product = await getProduct(user, id);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  const canReadInventory = user.permissions.has("inventory.read");
  const canViewExpiry = user.permissions.has("inventory.view_expiry");
  const canViewMovements = user.permissions.has("inventory.view_movements");

  const [stock, batches, movements] = await Promise.all([
    canReadInventory ? getSellableStock(id, product.trackExpiry) : Promise.resolve({ sellable: 0, onHand: 0, nonSellable: 0 }),
    canViewExpiry ? listProductBatches(user, id) : Promise.resolve([]),
    canViewMovements
      ? listMovements(user, { productId: id, page: 1, pageSize: 20 })
      : Promise.resolve({ movements: [], total: 0, page: 1, pageSize: 20 }),
  ]);

  const low = product.sellable !== null && product.sellable <= product.minimumStock;

  return (
    <div className="grid gap-6">
      <div>
        <Link href="/products" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowRightIcon className="size-4 rtl:rotate-180" aria-hidden />
          عودة إلى المنتجات
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-xl font-bold">{product.name}</h1>
          <Badge variant={product.active ? "default" : "secondary"}>
            {product.active ? "نشط" : "معطل"}
          </Badge>
        </div>
        {product.barcode || product.sku ? (
          <p className="text-sm text-muted-foreground" dir="ltr">
            {product.barcode ? `EAN: ${product.barcode}` : `SKU: ${product.sku}`}
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoCard label="الفئة" value={product.categoryName || "—"} />
        <InfoCard label="العلامة التجارية" value={product.brandName || "—"} />
        <InfoCard label="الوحدة" value={product.unit} />
        <InfoCard label="الوصف" value={product.description || "—"} multiline />
        <InfoCard label="تكلفة الشراء" value={formatMoney(product.purchaseCost)} />
        <InfoCard label="سعر البيع" value={formatMoney(product.sellingPrice)} />
        <InfoCard label="الحد الأدنى للمخزون" value={String(product.minimumStock)} />
        <InfoCard
          label="المخزون المتاح"
          value={`${product.sellable === null ? "—" : product.sellable} ${product.unit}`}
          tone={product.sellable !== null && (product.sellable <= 0 || low) ? "warning" : "default"}
        />
      </div>

      {canViewExpiry && product.trackExpiry ? (
        <section className="grid gap-3">
          <h2 className="font-heading text-base font-bold">الدفعات</h2>
          <div className="overflow-x-auto rounded-lg border bg-background">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="p-3 text-start font-medium">رمز الدفعة</th>
                  <th className="p-3 text-start font-medium">الكمية</th>
                  <th className="p-3 text-start font-medium">تاريخ الانتهاء</th>
                  <th className="p-3 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-3 text-center text-muted-foreground">
                      لا توجد دفعات
                    </td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="p-3" dir="ltr">{b.batchCode || "—"}</td>
                      <td className="p-3">{b.quantity}</td>
                      <td className="p-3">{formatDate(b.expiryDate)}</td>
                      <td className="p-3">
                        <Badge variant={b.expired ? "destructive" : "default"}>
                          {b.expired ? "منتهية" : "صالحة"}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {canViewMovements ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-base font-bold">آخر حركات المخزون</h2>
            <Link href={`/inventory/movements?product=${product.id}`} className="text-sm text-muted-foreground hover:text-foreground">
              عرض الكل
            </Link>
          </div>
          <MovementList movements={movements.movements} usedSellable={stock.sellable} />
        </section>
      ) : null}
    </div>
  );
}

function InfoCard({
  label,
  value,
  tone = "default",
  multiline = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "warning";
  multiline?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 font-medium ${tone === "warning" ? "text-amber-600" : ""} ${multiline ? "whitespace-pre-line" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function MovementList({
  movements,
  usedSellable,
}: {
  movements: Array<{ id: string; productName: string; type: string; quantity: number; reason: string; createdAt: string }>;
  usedSellable: number;
}) {
  void usedSellable;
  const labels: Record<string, string> = {
    PURCHASE: "شراء",
    SALE: "بيع",
    CUSTOMER_RETURN: "إرجاع عميل",
    SUPPLIER_RETURN: "إرجاع مورد",
    DAMAGE: "تلف",
    EXPIRY: "انتهاء صلاحية",
    ADJUSTMENT: "تعديل",
    STOCK_COUNT: "جرد",
    TRANSFER: "تحويل",
  };
  if (movements.length === 0) {
    return (
      <div className="rounded-lg border bg-background p-6 text-center text-sm text-muted-foreground">
        لا توجد حركات بعد
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="p-3 text-start font-medium">التاريخ</th>
            <th className="p-3 text-start font-medium">النوع</th>
            <th className="p-3 text-start font-medium">الكمية</th>
            <th className="p-3 text-start font-medium">السبب</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id} className="border-b last:border-0">
              <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(m.createdAt)}</td>
              <td className="p-3">{labels[m.type] ?? m.type}</td>
              <td className={`p-3 font-semibold ${m.quantity > 0 ? "text-emerald-700" : "text-destructive"}`}>
                {m.quantity > 0 ? "+" : ""}
                {m.quantity}
              </td>
              <td className="p-3 text-muted-foreground">{m.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP" }).format(value);
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-EG", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}
