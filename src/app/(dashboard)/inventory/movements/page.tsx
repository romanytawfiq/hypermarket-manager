import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listMovements } from "@/services/inventory.service";
import type { MovementQuery } from "@/lib/validations/inventory";
import { listProducts } from "@/services/catalog.service";
import { AppError } from "@/lib/errors";
import { MovementsTable } from "@/components/inventory/movements-table";

export const metadata: Metadata = {
  title: "حركات المخزون — نكسا ريتيل",
};

const MOVEMENT_LABELS: Record<string, string> = {
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

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = (await getCurrentUser())!;
  const params = await searchParams;
  const get = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const query: MovementQuery = {
    productId: get(params.product),
    type: get(params.type) as MovementQuery["type"] | undefined,
    page: get(params.page) ? Number(get(params.page)) : 1,
    pageSize: 50,
  };

  let data;
  let products;
  try {
    const [movementResult, productResult] = await Promise.all([
      listMovements(user, query),
      listProducts(user, { status: "all", page: 1, pageSize: 500 }),
    ]);
    data = movementResult;
    products = productResult.items;
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <MovementsTable
      movements={data.movements}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      productFilter={get(params.product)}
      typeFilter={query.type}
      movementLabels={MOVEMENT_LABELS}
      products={products.map((p) => ({ id: p.id, name: p.name }))}
    />
  );
}
