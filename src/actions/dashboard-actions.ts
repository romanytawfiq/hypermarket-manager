"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardData, type DashboardData, type DashboardPeriod } from "@/services/dashboard.service";

/**
 * Dashboard Server Action.
 * Returns role-filtered dashboard data for the current user.
 */
export async function getDashboardAction(opts: {
  period?: DashboardPeriod;
  customFrom?: string;
  customTo?: string;
} = {}): Promise<DashboardData | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;
    return await getDashboardData(user, opts.period ?? "today", opts.customFrom, opts.customTo);
  } catch {
    return null;
  }
}