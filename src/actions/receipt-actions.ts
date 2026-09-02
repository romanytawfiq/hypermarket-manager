"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  getSaleReceiptViewModel,
  getCafeReceiptViewModel,
  getCustomerPaymentReceiptViewModel,
  type ReceiptViewModel,
} from "@/services/receipt.service";

/**
 * Receipt actions (Phase 8).
 *
 * Server Actions used by client previews to fetch the authoritative receipt
 * view model for a persisted transaction. Authorization + NOT_FOUND + IDOR
 * protection run server-side in the receipt service; failures resolve to null
 * so the client can show a safe, non-leaking empty state.
 */

/** Fetches the receipt view model for a retail sale (authoritative server load). */
export async function getSaleReceiptAction(id: string): Promise<ReceiptViewModel | null> {
  try {
    return await getSaleReceiptViewModel(await getCurrentUser(), id);
  } catch {
    return null;
  }
}

/** Fetches the receipt view model for a café order (authoritative server load). */
export async function getCafeReceiptAction(id: string): Promise<ReceiptViewModel | null> {
  try {
    return await getCafeReceiptViewModel(await getCurrentUser(), id);
  } catch {
    return null;
  }
}

/** Fetches the receipt view model for a customer payment (إيصال سداد). */
export async function getCustomerPaymentReceiptAction(
  id: string,
): Promise<ReceiptViewModel | null> {
  try {
    return await getCustomerPaymentReceiptViewModel(await getCurrentUser(), id);
  } catch {
    return null;
  }
}