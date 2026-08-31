import type { PermissionId } from "@/lib/access-control/permissions";
import type { RoleId } from "@/lib/access-control/roles";

/** A RoledUser has a role reference; used for server-side permission checks. */
export interface RoledUser {
  id: string;
  role: RoleId;
}

/**
 * Returns true when `user` holds `permission` according to the role's
 * permission set. Never call this from the client with client-supplied role
 * data; it must receive a role resolved from the server (database).
 */
export function hasPermission(
  user: RoledUser,
  permission: PermissionId | PermissionId[],
  rolePermissions: ReadonlySet<string>,
): boolean {
  const required = Array.isArray(permission) ? permission : [permission];
  return required.every((id) => rolePermissions.has(id));
}
