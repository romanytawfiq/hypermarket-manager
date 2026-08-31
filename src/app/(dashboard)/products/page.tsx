import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listProducts, listCategories, listBrands } from "@/services/catalog.service";
import type { ProductQuery } from "@/lib/validations/catalog";
import { AppError } from "@/lib/errors";
import { ProductsManager } from "@/components/catalog/products-manager";

export const metadata: Metadata = {
  title: "المنتجات — نكسا ريتيل",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = (await getCurrentUser())!;
  const params = await searchParams;

  const parse = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const query: ProductQuery = {
    q: parse(params.q),
    categoryId: parse(params.category),
    brandId: parse(params.brand),
    status: (parse(params.status) as ProductQuery["status"]) ?? "active",
    page: parse(params.page) ? Number(parse(params.page)) : 1,
    pageSize: 20,
  };

  let data;
  let categories;
  let brands;
  try {
    const [productResult, catResult, brandResult] = await Promise.all([
      listProducts(user, query),
      listCategories(user),
      listBrands(user),
    ]);
    data = productResult;
    categories = catResult;
    brands = brandResult;
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return (
    <ProductsManager
      items={data.items}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      categories={categories}
      brands={brands}
      canCreate={user.permissions.has("products.create")}
      canUpdate={user.permissions.has("products.update")}
      canDisable={user.permissions.has("products.disable")}
    />
  );
}
