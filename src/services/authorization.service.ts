import { AppError } from "@/lib/errors";
import { hasPermission } from "@/lib/access-control/permission";
import type { PermissionId } from "@/lib/access-control/permissions";
import type { AuthUser } from "@/services/auth.service";

/**
 * Server-side authorization API.
 *
 * Authorization is enforced here, independent of UI visibility. Every mutation
 * boundary (Server Action, Route Handler, and sensitive service operations)
 * uses these guards with a user resolved from the server session — never from
 * client-supplied role data.
 */

const UNAUTHORIZED_MESSAGE = "يجب تسجيل الدخول للوصول إلى هذا الإجراء";
const FORBIDDEN_MESSAGE = "ليس لديك صلاحية لتنفيذ هذا الإجراء";

/** Requires an authenticated user. Throws UNAUTHORIZED when missing. */
export function requireAuth(user: AuthUser | null): AuthUser {
  if (!user) {
    throw new AppError("UNAUTHORIZED", UNAUTHORIZED_MESSAGE);
  }
  return user;
}

/** True when the user holds every listed permission. */
export function can(
  user: AuthUser,
  permission: PermissionId | PermissionId[],
): boolean {
  return hasPermission(
    { id: user.id, role: user.role },
    permission,
    user.permissions,
  );
}

/**
 * Requires the user to hold `permission`. Throws FORBIDDEN otherwise.
 * Fail-closed: a user with no permissions is denied.
 */
export function requirePermission(
  user: AuthUser | null,
  permission: PermissionId | PermissionId[],
): AuthUser {
  const authed = requireAuth(user);
  if (!can(authed, permission)) {
    throw new AppError("FORBIDDEN", FORBIDDEN_MESSAGE);
  }
  return authed;
}
