"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  cafeOrderCreateSchema,
  cafeTransitionSchema,
  type CafeOrderCreateInput,
  type CafeTransitionInput,
} from "@/lib/validations/cafe";
import {
  createCafeOrder,
  transitionCafeOrder,
  listKdsOrders,
  listActiveCafeOrders,
  listCafeOrderHistory,
  pollOutboxEvents,
  latestOutboxSequence,
  cafeSearchProducts,
  cafeSearchCustomers,
  type CafeOrderDto,
  type CafeOrderStatusDto,
  type CafeProductSearchDto,
  type CafeCustomerSearchDto,
  type CafeEventDto,
} from "@/services/cafe.service";
import { resolveError } from "@/lib/errors";

/**
 * Café orders & Barista KDS Server Actions (Phase 7).
 * Authorization runs in the service; prices/totals are never trusted from the
 * client.
 */

export interface CafeActionState {
  error?: string;
  order?: CafeOrderDto;
}

function parse<T>(schema: z.ZodType<T>, input: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  return { ok: true, data: result.data };
}

/* ---- Create / transition ---- */

export async function createCafeOrderAction(input: CafeOrderCreateInput): Promise<CafeActionState> {
  const p = parse(cafeOrderCreateSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    const order = await createCafeOrder(await getCurrentUser(), p.data);
    revalidatePath("/cafe");
    revalidatePath("/kds");
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

export async function transitionCafeOrderAction(input: CafeTransitionInput): Promise<CafeActionState> {
  const p = parse(cafeTransitionSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    const order = await transitionCafeOrder(
      await getCurrentUser(),
      p.data.orderId,
      p.data.targetStatus as CafeOrderStatusDto,
    );
    revalidatePath("/cafe");
    revalidatePath("/kds");
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

/* ---- Reads ---- */

export async function listKdsOrdersAction(): Promise<CafeOrderDto[]> {
  try {
    return await listKdsOrders(await getCurrentUser());
  } catch {
    return [];
  }
}

/** Active (non-terminal) orders for the cashier café view. */
export async function listActiveCafeOrdersAction(): Promise<CafeOrderDto[]> {
  try {
    return await listActiveCafeOrders(await getCurrentUser());
  } catch {
    return [];
  }
}

export async function listCafeOrderHistoryAction(limit = 50): Promise<CafeOrderDto[]> {
  try {
    return await listCafeOrderHistory(await getCurrentUser(), limit);
  } catch {
    return [];
  }
}

/** Product search for the café order screen. */
export async function cafeSearchProductsAction(query: string): Promise<CafeProductSearchDto[]> {
  try {
    return await cafeSearchProducts(await getCurrentUser(), query);
  } catch (error) {
    console.error("[cafe-actions] cafeSearchProductsAction error:", error);
    return [];
  }
}

/** Customer search for optional café order association. */
export async function cafeSearchCustomersAction(query: string): Promise<CafeCustomerSearchDto[]> {
  try {
    return await cafeSearchCustomers(await getCurrentUser(), query);
  } catch {
    return [];
  }
}

/* ---- Realtime helpers (used by the SSE route + initial hydrate) ---- */

export async function cafePollEventsAction(after: number, limit?: number): Promise<CafeEventDto[]> {
  try {
    return await pollOutboxEvents(await getCurrentUser(), after, limit);
  } catch {
    return [];
  }
}

export async function cafeLatestSequenceAction(): Promise<number> {
  try {
    return await latestOutboxSequence(await getCurrentUser());
  } catch {
    return 0;
  }
}
