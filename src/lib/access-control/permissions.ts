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

  // POS, Payments & Cashier Shifts (Phase 4)
  "sales.read",
  "sales.create",

  "payments.read",

  "shifts.read",
  "shifts.open",
  "shifts.close",

  "cash_movements.read",
  "cash_movements.create",

  "receipts.print",

  "reports.view",

  "settings.view",
  "settings.manage",

  // Café Orders & Barista KDS (Phase 7)
  "cafe.orders.read",
  "cafe.orders.create",
  "cafe.orders.update",
  "cafe.orders.cancel",
  "cafe.orders.status",
  "cafe.kds.view",

  // Online Store & Delivery (Phase 9)
  "online.orders.read",
  "online.orders.manage",
  "online.products.read",
  "delivery.orders.read",
  "delivery.orders.update",
] as const;

export type PermissionId = (typeof PERMISSIONS)[number];

/** Set of every valid permission id, used for runtime validation. */
export const PERMISSION_SET: ReadonlySet<string> = new Set<string>(PERMISSIONS);
