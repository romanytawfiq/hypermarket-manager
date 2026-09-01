import { getCurrentUser } from "@/lib/auth/current-user";
import { getDashboardData } from "@/services/dashboard.service";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;
  const dashboardData = await getDashboardData(user);

  return <DashboardClient initialData={dashboardData} user={user} />;
}