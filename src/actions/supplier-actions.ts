"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { supplierSchema, type SupplierInput } from "@/lib/validations/purchasing";
import {
  createSupplier,
  updateSupplier,
  setSupplierActive,
} from "@/services/supplier.service";
import { resolveError } from "@/lib/errors";

/**
 * Supplier Server Actions.
 * Authorization runs in the service; input is re-validated server-side.
 */

export interface SupplierActionState {
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

export async function createSupplierAction(input: SupplierInput): Promise<SupplierActionState> {
  const p = parse(supplierSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createSupplier(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/suppliers");
  return { success: true };
}

export async function updateSupplierAction(id: string, input: SupplierInput): Promise<SupplierActionState> {
  const p = parse(supplierSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await updateSupplier(await getCurrentUser(), id, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { success: true };
}

export async function setSupplierActiveAction(id: string, active: boolean): Promise<SupplierActionState> {
  try {
    await setSupplierActive(await getCurrentUser(), id, active);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/suppliers");
  return { success: true };
}
