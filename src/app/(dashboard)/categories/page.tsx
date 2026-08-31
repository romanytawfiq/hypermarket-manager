import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listCategories } from "@/services/catalog.service";
import { AppError } from "@/lib/errors";
import { CategoriesManager } from "@/components/catalog/categories-manager";

export const metadata: Metadata = {
  title: "الفئات — نكسا ريتيل",
};

export default async function CategoriesPage() {
  const user = (await getCurrentUser())!;

  let categories;
  try {
    categories = await listCategories(user);
  } catch (error) {
    if (error instanceof AppError && (error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")) {
      redirect("/");
    }
    throw error;
  }

  return <CategoriesManager categories={categories} canManage={user.permissions.has("categories.manage")} />;
}
