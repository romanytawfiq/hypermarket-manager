"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  onlineCheckoutSchema,
  onlineTrackOrderSchema,
  onlineTransitionSchema,
  onlineAssignSchema,
  type OnlineCheckoutInput,
  type OnlineTransitionInput,
  type OnlineAssignInput,
  type OnlineTrackOrderInput,
} from "@/lib/validations/online-store";
import {
  createOnlineOrder,
  trackOnlineOrder,
  listOnlineOrders,
  getOnlineOrder,
  listOnlineOrdersPage,
  type OnlineOrderDto,
  type OnlineOrdersQuery,
  type OnlineOrdersPageResult,
  transitionOnlineOrder,
  assignOnlineOrder,
  collectCodAndDeliver,
  listDeliveryOrders,
  type OnlineProductDto,
} from "@/services/online-store.service";
import {
  listOnlineProducts,
  getOnlineProduct,
  searchOnlineProducts,
  getOnlineCategories,
  deliverPaidOnlineOrder,
  type OnlineCatalogQuery,
  type OnlineCatalogResult,
} from "@/services/online-store.service";
import {
  parseOrderedQuery,
  verifyRedirectSignature,
  kashierConfig,
  isKashierConfigured,
} from "@/lib/kashier";
import { resolveError } from "@/lib/errors";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * Online store & delivery Server Actions (Phase 9).
 * Authorization runs in the service; prices/totals/stock are never trusted from
 * the client.
 */

export interface OnlineActionState {
  error?: string;
  order?: OnlineOrderDto;
  /** Per-order tracking secret returned once at checkout (used by the confirmation page). */
  trackingToken?: string;
  /** Hosted Kashier payment page URL for online-paid orders. */
  paymentSessionUrl?: string;
  /** Kashier session id (pending payment reference) for online-paid orders. */
  paymentSessionId?: string;
}

function parse<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(input);
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }
  return { ok: true, data: result.data };
}

/* ---- Public catalog reads (server components call the service directly) ---- */

export async function listOnlineProductsAction(): Promise<OnlineProductDto[]> {
  try {
    return await listOnlineProducts();
  } catch {
    return [];
  }
}

export async function getOnlineProductAction(
  id: string,
): Promise<OnlineProductDto | null> {
  try {
    return await getOnlineProduct(id);
  } catch {
    return null;
  }
}

/** Server-side, bounded catalog query (Phase 9.2). Public. */
export async function searchOnlineProductsAction(
  query: OnlineCatalogQuery = {},
): Promise<OnlineCatalogResult | null> {
  try {
    return await searchOnlineProducts(query);
  } catch {
    return null;
  }
}

/** Online-browsable categories for the storefront filter. Public. */
export async function getOnlineCategoriesAction(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    return await getOnlineCategories();
  } catch {
    return [];
  }
}

/* ---- Checkout ---- */

export async function createOnlineOrderAction(
  input: OnlineCheckoutInput,
): Promise<OnlineActionState> {
  if (await isRateLimited()) {
    return { error: "محاولات كثيرة. حاول مرة أخرى بعد قليل" };
  }

  const p = parse(onlineCheckoutSchema, input);

  if (!p.ok) return { error: p.error };
  try {
    const result = await createOnlineOrder(p.data);

    return {
      order: result.order,
      trackingToken: result.trackingToken,
      paymentSessionUrl: result.paymentSessionUrl,
      paymentSessionId: result.paymentSessionId,
    };
  } catch (error) {
    console.log(error);
    return { error: resolveError(error).userMessage };
  }
}

/** True when the Kashier gateway is configured (electronic payment is offered). */
export async function onlinePaymentAvailableAction(): Promise<boolean> {
  return isKashierConfigured();
}

/** Verifies the Kashier merchant redirect (defense-in-depth) and returns its status. */
export async function kashierRedirectStatusAction(searchString: string): Promise<{
  signatureValid: boolean;
  paymentStatus: string;
}> {
  try {
    const cfg = kashierConfig();
    if (!cfg.secretKey) return { signatureValid: false, paymentStatus: "" };
    const entries = parseOrderedQuery(searchString);
    const sig = entries.find(([k]) => k === "signature");
    const status = entries.find(([k]) => k === "paymentStatus");
    const signatureValid = sig
      ? verifyRedirectSignature(entries, sig[1], cfg.secretKey)
      : false;
    return { signatureValid, paymentStatus: status?.[1] ?? "" };
  } catch {
    return { signatureValid: false, paymentStatus: "" };
  }
}

/** Delivers a paid-online order (posts the non-cash Sale). Requires the delivery permission set. */
export async function deliverPaidOnlineOrderAction(
  orderId: string,
): Promise<OnlineActionState> {
  try {
    const user = await getCurrentUser();
    const order = await deliverPaidOnlineOrder(user, orderId);
    revalidatePath("/online-orders");
    revalidatePath("/delivery");
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

/* ---- Tracking ---- */

export async function trackOnlineOrderAction(
  input: OnlineTrackOrderInput,
): Promise<OnlineActionState> {
  const p = parse(onlineTrackOrderSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    const order = await trackOnlineOrder(p.data.orderNumber, p.data.trackingToken);
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

/* ---- Admin reads ---- */

export async function listOnlineOrdersAction(opts?: {
  status?: string;
}): Promise<OnlineOrderDto[]> {
  try {
    return await listOnlineOrders(await getCurrentUser(), opts);
  } catch {
    return [];
  }
}

/** Paginated, server-filtered Online Orders dashboard query. Requires `online.orders.read`. */
export async function listOnlineOrdersPageAction(
  query: OnlineOrdersQuery = {},
): Promise<OnlineOrdersPageResult | null> {
  try {
    return await listOnlineOrdersPage(await getCurrentUser(), query);
  } catch {
    return null;
  }
}

export async function getOnlineOrderAction(id: string): Promise<OnlineOrderDto | null> {
  try {
    return await getOnlineOrder(await getCurrentUser(), id);
  } catch {
    return null;
  }
}

/* ---- Delivery workflow reads ---- */

export async function listDeliveryOrdersAction(): Promise<OnlineOrderDto[]> {
  try {
    return await listDeliveryOrders(await getCurrentUser());
  } catch {
    return [];
  }
}

/* ---- Mutations ---- */

export async function transitionOnlineOrderAction(
  input: OnlineTransitionInput,
): Promise<OnlineActionState> {
  const p = parse(onlineTransitionSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    const order = await transitionOnlineOrder(await getCurrentUser(), p.data);
    revalidatePath("/online-orders");
    revalidatePath("/delivery");
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

export async function assignOnlineOrderAction(
  input: OnlineAssignInput,
): Promise<OnlineActionState> {
  const p = parse(onlineAssignSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    const order = await assignOnlineOrder(await getCurrentUser(), p.data);
    revalidatePath("/online-orders");
    revalidatePath("/delivery");
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}

/** Collects COD and delivers the order, posting the financial Sale (shift-bound). */
export async function collectCodAndDeliverAction(
  orderId: string,
): Promise<OnlineActionState> {
  try {
    const user = await getCurrentUser();
    const order = await collectCodAndDeliver(user, orderId);
    revalidatePath("/online-orders");
    revalidatePath("/delivery");
    return { order };
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
}
