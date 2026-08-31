import { getCurrentUser } from "@/lib/auth/current-user";
import { getNavItems } from "@/lib/navigation";
import { LinkCard } from "@/components/dashboard/link-card";

export default async function DashboardHome() {
  // The (dashboard) layout redirects anonymous visitors, so this is non-null.
  const user = (await getCurrentUser())!;
  const navItems = getNavItems(user);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-xl font-bold">مرحبًا، {user.name}</h1>
        <p className="text-sm text-muted-foreground">
          اختر إحدى الوحدات للبدء في العمل
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {navItems.map((item) => (
          <LinkCard key={item.href} href={item.href} icon={item.icon} label={item.label} />
        ))}
      </div>
    </div>
  );
}
