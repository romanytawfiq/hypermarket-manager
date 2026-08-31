"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  categorySchema,
  brandSchema,
  productCreateSchema,
  productUpdateSchema,
  type CategoryInput,
  type BrandInput,
  type ProductCreateInput,
  type ProductUpdateInput,
} from "@/lib/validations/catalog";
import {
  createCategory,
  updateCategory,
  deactivateCategory,
  createBrand,
  updateBrand,
  deactivateBrand,
  createProduct,
  updateProduct,
  setProductActive,
} from "@/services/catalog.service";
import { resolveError } from "@/lib/errors";

/**
 * Catalog Server Actions.
 *
 * Authorization runs in the catalog service against the server-resolved current
 * user. Every action re-validates its input server-side (never trusting the
 * client) and returns a safe Arabic message.
 */

export interface CatalogActionState {
  error?: string;
  success?: boolean;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  return { ok: true, data: result.data };
}

/* ---- Categories ---- */

export async function createCategoryAction(input: CategoryInput): Promise<CatalogActionState> {
  const p = parse(categorySchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createCategory(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/categories");
  return { success: true };
}

export async function updateCategoryAction(id: string, input: CategoryInput): Promise<CatalogActionState> {
  const p = parse(categorySchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await updateCategory(await getCurrentUser(), id, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/categories");
  return { success: true };
}

export async function deactivateCategoryAction(id: string): Promise<CatalogActionState> {
  try {
    await deactivateCategory(await getCurrentUser(), id);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/categories");
  return { success: true };
}

/* ---- Brands ---- */

export async function createBrandAction(input: BrandInput): Promise<CatalogActionState> {
  const p = parse(brandSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createBrand(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/brands");
  return { success: true };
}

export async function updateBrandAction(id: string, input: BrandInput): Promise<CatalogActionState> {
  const p = parse(brandSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await updateBrand(await getCurrentUser(), id, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/brands");
  return { success: true };
}

export async function deactivateBrandAction(id: string): Promise<CatalogActionState> {
  try {
    await deactivateBrand(await getCurrentUser(), id);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/brands");
  return { success: true };
}

/* ---- Products ---- */

export async function createProductAction(input: ProductCreateInput): Promise<CatalogActionState> {
  const p = parse(productCreateSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createProduct(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/products");
  revalidatePath("/inventory");
  return { success: true };
}

export async function updateProductAction(id: string, input: ProductUpdateInput): Promise<CatalogActionState> {
  const p = parse(productUpdateSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await updateProduct(await getCurrentUser(), id, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { success: true };
}

export async function setProductActiveAction(id: string, active: boolean): Promise<CatalogActionState> {
  try {
    await setProductActive(await getCurrentUser(), id, active);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { success: true };
}
