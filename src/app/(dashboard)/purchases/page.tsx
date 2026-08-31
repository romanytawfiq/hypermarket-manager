import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listPurchases } from "@/services/purchasing.service";
import { listSuppliers } from "@/services/supplier.service";
import { listProducts } from "@/services/catalog.service";
import { AppError } from "@/lib/errors";
import { PurchasesManager } from "@/components/suppliers/purchases-manager";

export const metadata: Metadata = {
  title: "المشتريات — نكسا ريتيل",
};

export default async function PurchasesPage() {
  const user = (await getCurrentUser())!;

  let purchases;
  let suppliers;
  let products;
  try {
    const perms = user.permissions;
    const [p, s, prod] = await Promise.all([
      perms.has("purchases.read")
        ? listPurchases(user, { page: 1, pageSize: 50 })
        : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 50 }),
      perms.has("purchases.create") && perms.has("suppliers.read") ? listSuppliers(user, true) : Promise.resolve([]),
      perms.has("purchases.create") && perms.has("products.read") ? listProducts(user, { status: "all", page: 1, pageSize: 100 }) : Promise.resolve({ items: [], total: 0, page: 1, pageSize: 100 }),
    ]);
    purchases = p;
    suppliers = s;
    products = prod.items ?? [];
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <PurchasesManager
      purchases={purchases.items ?? []}
      suppliers={suppliers}
      products={products}
      canCreate={user.permissions.has("purchases.create")}
      canReceive={user.permissions.has("purchases.receive")}
      canReturn={user.permissions.has("purchases.return")}
    />
  );
}
