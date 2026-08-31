import { PERMISSIONS, type PermissionId } from "@/lib/access-control/permissions";

/**
 * Business roles.
 *
 * Identifiers are stable English values stored in the database and used in
 * code. User-facing labels are Modern Standard Arabic.
 *
 * `permissions` lists the permission identifiers granted to each role. The
 * Owner is the highest privilege role and, by default, holds every permission.
 */

export const ROLES = ["OWNER", "MANAGER", "CASHIER", "ACCOUNTANT", "WAREHOUSE_EMPLOYEE", "BARISTA"] as const;

export type RoleId = (typeof ROLES)[number];

/** Arabic label shown to users for each role. */
export const ROLE_LABELS: Record<RoleId, string> = {
  OWNER: "مالك",
  MANAGER: "مدير",
  CASHIER: "كاشير",
  ACCOUNTANT: "محاسب",
  WAREHOUSE_EMPLOYEE: "مسؤول المخزن",
  BARISTA: "باريستا",
};

/** Returns the Arabic label for a role, or an empty string when unknown. */
export function roleLabel(role: RoleId): string {
  return ROLE_LABELS[role] ?? "";
}

/** Validates that a value is a known role id. */
export function isRoleId(value: unknown): value is RoleId {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Default permission matrix for each role.
 *
 * These defaults are seeded when a role is first created and are human-editable
 * through `roles.manage`. The Owner intentionally holds every permission so
 * the application always retains a fully privileged role.
 */
const ROLE_DEFAULT_PERMISSIONS: Record<RoleId, readonly PermissionId[]> = {
  OWNER: PERMISSIONS,
  MANAGER: [
    "users.read",
    "users.create",
    "users.update",
    "users.disable",
    "roles.read",
    "reports.view",
    "settings.view",
    // Catalog & Inventory
    "products.read",
    "products.create",
    "products.update",
    "products.disable",
    "categories.read",
    "categories.manage",
    "brands.read",
    "brands.manage",
    "inventory.read",
    "inventory.adjust",
    "inventory.count",
    "inventory.view_movements",
    "inventory.view_expiry",
    "inventory.view_replenishment",
  ],
  WAREHOUSE_EMPLOYEE: [
    "products.read",
    "products.create",
    "products.update",
    "products.disable",
    "categories.read",
    "categories.manage",
    "brands.read",
    "brands.manage",
    "inventory.read",
    "inventory.adjust",
    "inventory.count",
    "inventory.view_movements",
    "inventory.view_expiry",
    "inventory.view_replenishment",
  ],
  ACCOUNTANT: [
    "users.read",
    "reports.view",
    "settings.view",
    "products.read",
    "categories.read",
    "brands.read",
    "inventory.read",
    "inventory.view_movements",
    "inventory.view_expiry",
    "inventory.view_replenishment",
  ],
  CASHIER: [],
  BARISTA: [],
};

/** Default permission ids for a role. */
export function defaultPermissionsForRole(role: RoleId): PermissionId[] {
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}
