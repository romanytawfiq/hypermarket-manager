"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  adjustStockSchema,
  stockCountSchema,
  damageSchema,
  disposeExpiredSchema,
  type AdjustStockInput,
  type StockCountInput,
  type DamageInput,
  type DisposeExpiredInput,
} from "@/lib/validations/inventory";
import {
  adjustStock,
  performStockCount,
  recordDamage,
  disposeExpired,
} from "@/services/inventory.service";
import { resolveError } from "@/lib/errors";

/**
 * Inventory Server Actions.
 *
 * All authorization and quantity math runs server-side; the client only sends
 * the recorded input. Each action re-validates its input and returns a safe
 * Arabic message.
 */

export interface InventoryActionState {
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

export async function adjustStockAction(input: AdjustStockInput): Promise<InventoryActionState> {
  const p = parse(adjustStockSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await adjustStock(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/replenishment");
  return { success: true };
}

export async function stockCountAction(input: StockCountInput): Promise<InventoryActionState> {
  const p = parse(stockCountSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await performStockCount(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/inventory/replenishment");
  return { success: true };
}

export async function recordDamageAction(input: DamageInput): Promise<InventoryActionState> {
  const p = parse(damageSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await recordDamage(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  return { success: true };
}

export async function disposeExpiredAction(input: DisposeExpiredInput): Promise<InventoryActionState> {
  const p = parse(disposeExpiredSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await disposeExpired(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/inventory");
  revalidatePath("/inventory/expiry");
  revalidatePath("/inventory/movements");
  return { success: true };
}
