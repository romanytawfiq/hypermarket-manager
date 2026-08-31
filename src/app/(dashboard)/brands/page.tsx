import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listBrands } from "@/services/catalog.service";
import { AppError } from "@/lib/errors";
import { BrandsManager } from "@/components/catalog/brands-manager";

export const metadata: Metadata = {
  title: "العلامات التجارية — نكسا ريتيل",
};

export default async function BrandsPage() {
  const user = (await getCurrentUser())!;

  let brands;
  try {
    brands = await listBrands(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return <BrandsManager brands={brands} canManage={user.permissions.has("brands.manage")} />;
}
