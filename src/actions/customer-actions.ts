"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  customerSchema,
  customerPaymentSchema,
  type CustomerInput,
  type CustomerPaymentInput,
} from "@/lib/validations/customers";
import {
  createCustomer,
  updateCustomer,
  setCustomerActive,
  listCustomers,
  getCustomer,
  posSearchCustomers,
  listCustomerLedger,
  listCustomerPayments,
  createCustomerPayment,
  type CustomerDto,
  type PosCustomerDto,
  type CustomerLedgerDto,
  type CustomerPaymentDto,
} from "@/services/customer.service";
import { resolveError } from "@/lib/errors";

/**
 * Customer Server Actions (Phase 5).
 * Authorization runs in the service; input is re-validated server-side.
 */

export interface CustomerActionState {
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

export async function createCustomerAction(input: CustomerInput): Promise<CustomerActionState> {
  const p = parse(customerSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createCustomer(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/customers");
  return { success: true };
}

export async function updateCustomerAction(id: string, input: CustomerInput): Promise<CustomerActionState> {
  const p = parse(customerSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await updateCustomer(await getCurrentUser(), id, p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

export async function setCustomerActiveAction(id: string, active: boolean): Promise<CustomerActionState> {
  try {
    await setCustomerActive(await getCurrentUser(), id, active);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${id}`);
  return { success: true };
}

/** Lists customers for the customers page. */
export async function listCustomersAction(activeOnly = false): Promise<CustomerDto[]> {
  try {
    return await listCustomers(await getCurrentUser(), { activeOnly });
  } catch {
    return [];
  }
}

/** Fetches a single customer (detail page). */
export async function getCustomerAction(id: string): Promise<CustomerDto | null> {
  try {
    return await getCustomer(await getCurrentUser(), id);
  } catch {
    return null;
  }
}

/** POS customer search (on-account sales). Scoped to `customers.credit`. */
export async function posSearchCustomersAction(query: string): Promise<PosCustomerDto[]> {
  try {
    return await posSearchCustomers(await getCurrentUser(), query);
  } catch {
    return [];
  }
}

/** Customer statement (ledger), oldest first. */
export async function listCustomerLedgerAction(id: string): Promise<CustomerLedgerDto[]> {
  try {
    return await listCustomerLedger(await getCurrentUser(), id);
  } catch {
    return [];
  }
}

/** Customer payments, newest first. */
export async function listCustomerPaymentsAction(id: string): Promise<CustomerPaymentDto[]> {
  try {
    return await listCustomerPayments(await getCurrentUser(), id);
  } catch {
    return [];
  }
}

/** Records a customer payment toward their receivable. */
export async function createCustomerPaymentAction(input: CustomerPaymentInput): Promise<CustomerActionState> {
  const p = parse(customerPaymentSchema, input);
  if (!p.ok) return { error: p.error };
  try {
    await createCustomerPayment(await getCurrentUser(), p.data);
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${p.data.customerId}`);
  return { success: true };
}
