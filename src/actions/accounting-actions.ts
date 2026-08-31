"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getAccountingOverview, type AccountingOverview } from "@/services/accounting.service";

/**
 * Accounting Server Actions (Phase 6).
 * Authorization runs in the service ("accounting.read").
 */

/** Fetches the accounting overview for an optional date range. */
export async function getAccountingOverviewAction(opts: {
  dateFrom?: string;
  dateTo?: string;
} = {}): Promise<AccountingOverview | null> {
  try {
    return await getAccountingOverview(await getCurrentUser(), opts);
  } catch {
    return null;
  }
}
