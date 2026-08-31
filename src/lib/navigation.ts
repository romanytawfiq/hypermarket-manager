import {
  BoxesIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  PackageIcon,
  PackageSearchIcon,
  ShoppingCartIcon,
  TagsIcon,
  TruckIcon,
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
 *
 * `icon` is a serializable identifier (never a component) so `NavItem[]` can
 * safely cross the Server -> Client boundary as props. The actual icon
 * component is resolved via `iconMap` on the consuming side.
 */

/** Serialized identifier for a navigation icon (safe to send to a Client Component). */
export type NavigationIcon =
  | "dashboard"
  | "products"
  | "categories"
  | "brands"
  | "inventory"
  | "movements"
  | "expiry"
  | "replenishment"
  | "suppliers"
  | "purchases"
  | "users";

/** Latest set of icons used by navigation; rendered by the client and server. */
export const iconMap: Record<NavigationIcon, LucideIcon> = {
  dashboard: LayoutDashboardIcon,
  products: PackageIcon,
  categories: ListTreeIcon,
  brands: TagsIcon,
  inventory: WarehouseIcon,
  movements: PackageSearchIcon,
  expiry: BoxesIcon,
  replenishment: BoxesIcon,
  suppliers: TruckIcon,
  purchases: ShoppingCartIcon,
  users: UsersIcon,
};

export interface NavItem {
  href: string;
  label: string;
  icon: NavigationIcon;
  /** Permission required to see this item. Undefined = visible to all. */
  permission?: PermissionId;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "الرئيسية", icon: "dashboard" },
  // Catalog
  { href: "/products", label: "المنتجات", icon: "products", permission: "products.read" },
  { href: "/categories", label: "الفئات", icon: "categories", permission: "categories.read" },
  { href: "/brands", label: "العلامات التجارية", icon: "brands", permission: "brands.read" },
  // Inventory
  { href: "/inventory", label: "المخزون", icon: "inventory", permission: "inventory.read" },
  { href: "/inventory/movements", label: "حركات المخزون", icon: "movements", permission: "inventory.view_movements" },
  { href: "/inventory/expiry", label: "انتهاء الصلاحية", icon: "expiry", permission: "inventory.view_expiry" },
  { href: "/inventory/replenishment", label: "إعادة التخزين", icon: "replenishment", permission: "inventory.view_replenishment" },
  // Suppliers & Purchasing
  { href: "/suppliers", label: "الموردون", icon: "suppliers", permission: "suppliers.read" },
  { href: "/purchases", label: "المشتريات", icon: "purchases", permission: "purchases.read" },
  // Admin
  { href: "/users", label: "المستخدمون", icon: "users", permission: "users.read" },
];

/** Returns the navigation items the user is allowed to see. */
export function getNavItems(user: AuthUser): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.permission || user.permissions.has(item.permission));
}
