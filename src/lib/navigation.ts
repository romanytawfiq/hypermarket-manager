import {
  BoxesIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  PackageIcon,
  PackageSearchIcon,
  TagsIcon,
  UsersIcon,
  WarehouseIcon,
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
  // Catalog
  { href: "/products", label: "المنتجات", icon: PackageIcon, permission: "products.read" },
  { href: "/categories", label: "الفئات", icon: ListTreeIcon, permission: "categories.read" },
  { href: "/brands", label: "العلامات التجارية", icon: TagsIcon, permission: "brands.read" },
  // Inventory
  { href: "/inventory", label: "المخزون", icon: WarehouseIcon, permission: "inventory.read" },
  { href: "/inventory/movements", label: "حركات المخزون", icon: PackageSearchIcon, permission: "inventory.view_movements" },
  { href: "/inventory/expiry", label: "انتهاء الصلاحية", icon: BoxesIcon, permission: "inventory.view_expiry" },
  { href: "/inventory/replenishment", label: "إعادة التخزين", icon: BoxesIcon, permission: "inventory.view_replenishment" },
  // Admin
  { href: "/users", label: "المستخدمون", icon: UsersIcon, permission: "users.read" },
];

/** Returns the navigation items the user is allowed to see. */
export function getNavItems(user: AuthUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || user.permissions.has(item.permission));
}
