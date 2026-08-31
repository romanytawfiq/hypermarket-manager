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
    // Suppliers & Purchasing
    "suppliers.read",
    "suppliers.create",
    "suppliers.update",
    "suppliers.disable",
    "suppliers.view_ledger",
    "purchases.read",
    "purchases.create",
    "purchases.receive",
    "purchases.return",
    "supplier_payments.read",
    "supplier_payments.create",
    // Customers & Credit / Receivables (Phase 5)
    "customers.read",
    "customers.create",
    "customers.update",
    "customers.disable",
    "customers.view_ledger",
    "customers.credit",
    "customer_payments.read",
    "customer_payments.create",
    // Expenses & Accounting (Phase 6)
    "expense_categories.read",
    "expense_categories.manage",
    "expenses.read",
    "expenses.create",
    "accounting.read",
    // POS, Payments & Shifts
    "sales.read",
    "sales.create",
    "payments.read",
    "shifts.read",
    "shifts.open",
    "shifts.close",
    "cash_movements.read",
    "cash_movements.create",
    "receipts.print",
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
    // Suppliers & Purchasing (receive + record purchases)
    "suppliers.read",
    "purchases.read",
    "purchases.create",
    "purchases.receive",
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
    // Suppliers & Purchasing
    "suppliers.read",
    "suppliers.view_ledger",
    "purchases.read",
    "supplier_payments.read",
    "supplier_payments.create",
    // Customers & Credit / Receivables (Phase 5) — read visibility
    "customers.read",
    "customers.view_ledger",
    "customer_payments.read",
    // Expenses & Accounting (Phase 6) — read visibility + expense entry
    "expense_categories.read",
    "expenses.read",
    "expenses.create",
    "accounting.read",
    // POS, Payments & Shifts (read + receipts)
    "sales.read",
    "payments.read",
    "shifts.read",
    "receipts.print",
  ],
  CASHIER: [
    // POS, Payments & Cashier Shifts (Phase 4)
    "sales.read",
    "sales.create",
    "payments.read",
    "shifts.read",
    "shifts.open",
    "shifts.close",
    "cash_movements.read",
    "receipts.print",
    // Customers & Credit / Receivables (Phase 5) — on-account sales + collection
    "customers.read",
    "customers.credit",
    "customer_payments.read",
    "customer_payments.create",
  ],
  BARISTA: [],
};

/** Default permission ids for a role. */
export function defaultPermissionsForRole(role: RoleId): PermissionId[] {
  return [...ROLE_DEFAULT_PERMISSIONS[role]];
}
