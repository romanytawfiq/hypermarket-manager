import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getNavItems } from "@/lib/navigation";
import { AppShell } from "@/components/dashboard/app-shell";

/**
 * Protected layout for the entire authenticated application.
 *
 * Re-validates the session against the database server-side and redirects
 * anonymous visitors to the Arabic login page. This is the security boundary
 * for navigation; individual operations are additionally authorized at the
 * action/service layer.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const navItems = getNavItems(user);

  return (
    <AppShell user={user} navItems={navItems}>
      {children}
    </AppShell>
  );
}
