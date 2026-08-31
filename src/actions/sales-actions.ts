"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  saleCreateSchema,
  type SaleCreateInput,
} from "@/lib/validations/sales";
import {
  createSale,
  posSearchProducts,
  listSales,
  getSale,
  listSalesByShift,
} from "@/services/sales.service";
import type { SaleDto, PosProductDto } from "@/services/sales.service";
import { resolveError } from "@/lib/errors";

/**
 * POS / sales Server Actions.
 * All prices, totals, stock, payments, and shift association are validated and
 * computed server-side; the client only supplies line quantities and payment
 * method/amount intent.
 */

export interface SaleActionState {
  error?: string;
  sale?: SaleDto;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  return { ok: true, data: result.data };
}

/** Creates (completes) a sale and returns the resulting sale for the receipt. */
export async function createSaleAction(input: SaleCreateInput): Promise<SaleActionState> {
  const p = parse(saleCreateSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    const sale = await createSale(await getCurrentUser(), p.data);
    revalidatePath("/pos");
    revalidatePath("/sales");
    revalidatePath("/shifts");
    revalidatePath("/inventory");
    revalidatePath("/inventory/movements");
    return { sale };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

/** POS product search (barcode/SKU/name). Scoped to `sales.create`. */
export async function posSearchAction(query: string): Promise<PosProductDto[]> {
  try {
    return await posSearchProducts(await getCurrentUser(), query);
  } catch {
    return [];
  }
}

/** Lists recent sales for the sales history page. */
export async function listSalesAction(limit = 100): Promise<SaleDto[]> {
  try {
    return await listSales(await getCurrentUser(), limit);
  } catch {
    return [];
  }
}

/** Fetches a single sale (receipt view / detail). */
export async function getSaleAction(id: string): Promise<SaleDto | null> {
  try {
    return await getSale(await getCurrentUser(), id);
  } catch {
    return null;
  }
}

/** Lists a shift's sales (shift detail / reconciliation view). */
export async function listShiftSalesAction(shiftId: string): Promise<SaleDto[]> {
  try {
    return await listSalesByShift(await getCurrentUser(), shiftId);
  } catch {
    return [];
  }
}
