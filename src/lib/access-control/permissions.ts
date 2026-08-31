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

  "reports.view",

  "settings.view",
  "settings.manage",
] as const;

export type PermissionId = (typeof PERMISSIONS)[number];

/** Set of every valid permission id, used for runtime validation. */
export const PERMISSION_SET: ReadonlySet<string> = new Set<string>(PERMISSIONS);
