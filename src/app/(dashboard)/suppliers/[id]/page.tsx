import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getSupplier,
  listSupplierLedger,
  listSupplierPayments,
  listSupplierPurchases,
} from "@/services/supplier.service";
import { listProducts } from "@/services/catalog.service";
import { AppError } from "@/lib/errors";
import { SupplierDetail } from "@/components/suppliers/supplier-detail";

export const metadata: Metadata = {
  title: "تفاصيل المورد — نكسا ريتيل",
};

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = (await getCurrentUser())!;

  let supplier;
  let ledger: Awaited<ReturnType<typeof listSupplierLedger>> = [];
  let payments: Awaited<ReturnType<typeof listSupplierPayments>> = [];
  let purchases: Awaited<ReturnType<typeof listSupplierPurchases>> = [];
  let products: Awaited<ReturnType<typeof listProducts>> = { items: [], total: 0, page: 1, pageSize: 0 };

  try {
    supplier = await getSupplier(user, id);
    const perms = user.permissions;
    const [l, p, pr, prod] = await Promise.all([
      perms.has("suppliers.view_ledger") ? listSupplierLedger(user, id) : Promise.resolve([]),
      perms.has("supplier_payments.read") ? listSupplierPayments(user, id) : Promise.resolve([]),
      perms.has("purchases.read") ? listSupplierPurchases(user, id) : Promise.resolve([]),
      perms.has("purchases.create") && perms.has("products.read") ? listProducts(user, { status: "all", page: 1, pageSize: 100 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 0 }),
    ]);
    ledger = l;
    payments = p;
    purchases = pr;
    products = prod;
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }

  return (
    <SupplierDetail
      supplier={supplier}
      ledger={ledger}
      payments={payments}
      purchases={purchases}
      products={products.items}
      canPay={user.permissions.has("supplier_payments.create")}
      canReceive={user.permissions.has("purchases.receive")}
      canReturn={user.permissions.has("purchases.return")}
      canCreatePurchase={user.permissions.has("purchases.create")}
    />
  );
}
