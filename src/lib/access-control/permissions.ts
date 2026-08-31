/**
 * Permission catalog for Nexa Retail.
 *
 * Identity-stable, English identifiers. This is the authoritative registry of
 * permissions justified by the current scope (Identity & RBAC) plus those
 * clearly required by docs/architecture.md §12.
 *
 * Future domains append their own permissions here (and to the seeded
 * Permission collection) rather than reusing role-name checks.
 */

export const PERMISSIONS = [
  "users.read",
  "users.create",
  "users.update",
  "users.disable",

  "roles.read",
  "roles.manage",

  // Catalog & Inventory (Phase 2)
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

  // Suppliers & Purchasing (Phase 3)
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

  "reports.view",

  "settings.view",
  "settings.manage",
] as const;

export type PermissionId = (typeof PERMISSIONS)[number];

/** Set of every valid permission id, used for runtime validation. */
export const PERMISSION_SET: ReadonlySet<string> = new Set<string>(PERMISSIONS);
