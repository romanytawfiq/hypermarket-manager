import {
  LayoutDashboardIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import type { AuthUser } from "@/services/auth.service";
import type { PermissionId } from "@/lib/access-control/permissions";

/**
 * Centralized, permission-aware navigation configuration.
 *
 * Navigation items declare the permission required to see them. Visibility is
 * ONLY a UX concern — authorization is enforced server-side independently.
 * Future features add their items (with their permissions) here.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permission required to see this item. Undefined = visible to all. */
  permission?: PermissionId;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: LayoutDashboardIcon },
  { href: "/users", label: "المستخدمون", icon: UsersIcon, permission: "users.read" },
];

/** Returns the navigation items the user is allowed to see. */
export function getNavItems(user: AuthUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || user.permissions.has(item.permission));
}
