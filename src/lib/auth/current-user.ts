import { cookies } from "next/headers";
import { cache } from "react";
import { getSessionUser, type AuthUser } from "@/services/auth.service";
import { sessionCookieName } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";

/**
 * Server-side access to the current authenticated user.
 *
 * - `getCurrentUser()` returns the AuthUser (or null) for Server Components /
 *   Server Actions.
 * - `requireUser()` returns the user or throws UNAUTHORIZED (redirect handled
 *   by route/layout protection).
 *
 * `cache()` memoizes the value for the duration of a single request, so it can
 * be called many times without re-querying the session.
 */

const USER_MESSAGE = "يجب تسجيل الدخول للوصول إلى هذه الصفحة";

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  if (!token) return null;
  return getSessionUser(token);
});

/** Returns the current user or throws UNAUTHORIZED. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AppError("UNAUTHORIZED", USER_MESSAGE);
  }
  return user;
}
