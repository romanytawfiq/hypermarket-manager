"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  purchaseCreateSchema,
  receivePurchaseSchema,
  supplierPaymentSchema,
  supplierReturnSchema,
  type PurchaseCreateInput,
  type ReceivePurchaseInput,
  type SupplierPaymentInput,
  type SupplierReturnInput,
} from "@/lib/validations/purchasing";
import {
  createPurchase,
  receivePurchase,
  createSupplierPayment,
  createSupplierReturn,
} from "@/services/purchasing.service";
import { resolveError } from "@/lib/errors";

/**
 * Purchasing Server Actions (purchases, receiving, payments, returns).
 * All authorization, totals, and balances are computed server-side.
 */

export interface PurchasingActionState {
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

export async function createPurchaseAction(input: PurchaseCreateInput): Promise<PurchasingActionState> {
  const p = parse(purchaseCreateSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createPurchase(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/purchases");
  revalidatePath("/suppliers");
  return { success: true };
}

export async function receivePurchaseAction(input: ReceivePurchaseInput): Promise<PurchasingActionState> {
  const p = parse(receivePurchaseSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await receivePurchase(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/suppliers");
  return { success: true };
}

export async function createSupplierPaymentAction(input: SupplierPaymentInput): Promise<PurchasingActionState> {
  const p = parse(supplierPaymentSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createSupplierPayment(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/suppliers");
  revalidatePath("/purchases");
  return { success: true };
}

export async function createSupplierReturnAction(input: SupplierReturnInput): Promise<PurchasingActionState> {
  const p = parse(supplierReturnSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createSupplierReturn(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/purchases");
  revalidatePath("/inventory");
  revalidatePath("/inventory/movements");
  revalidatePath("/suppliers");
  return { success: true };
}
