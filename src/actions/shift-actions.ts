"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  shiftOpenSchema,
  shiftCloseSchema,
  cashMovementSchema,
  type ShiftOpenInput,
  type ShiftCloseInput,
  type CashMovementInput,
} from "@/lib/validations/sales";
import {
  openShift,
  closeShift,
  getActiveShift,
  listShifts,
  recordCashMovement,
  listCashMovements,
} from "@/services/shift.service";
import type { ShiftDto } from "@/services/shift.service";
import { resolveError } from "@/lib/errors";

/**
 * Cashier shift Server Actions (open/close, cash movements).
 */

export interface ShiftActionState {
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

export async function openShiftAction(input: ShiftOpenInput): Promise<ShiftActionState> {
  const p = parse(shiftOpenSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await openShift(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/pos");
  revalidatePath("/shifts");
  return { success: true };
}

export async function closeShiftAction(
  shiftId: string,
  input: ShiftCloseInput,
): Promise<ShiftActionState> {
  const p = parse(shiftCloseSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await closeShift(await getCurrentUser(), shiftId, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/pos");
  revalidatePath("/shifts");
  return { success: true };
}

export async function recordCashMovementAction(
  shiftId: string,
  input: CashMovementInput,
): Promise<ShiftActionState> {
  const p = parse(cashMovementSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await recordCashMovement(await getCurrentUser(), shiftId, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/shifts");
  return { success: true };
}

/** Returns the current user's active shift, or null. */
export async function getActiveShiftAction(): Promise<ShiftDto | null> {
  try {
    return await getActiveShift(await getCurrentUser());
  } catch {
    return null;
  }
}

/** Lists shifts for the current user. */
export async function listShiftsAction(): Promise<ShiftDto[]> {
  try {
    return await listShifts(await getCurrentUser());
  } catch {
    return [];
  }
}

/** Lists a shift's cash movements. */
export async function listShiftCashMovementsAction(shiftId: string) {
  try {
    return await listCashMovements(await getCurrentUser(), shiftId);
  } catch {
    return [];
  }
}
