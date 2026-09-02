"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loginSchema } from "@/lib/validations/auth";
import { authenticate, destroySession } from "@/services/auth.service";
import { sessionCookieName, sessionCookieOptions } from "@/lib/auth/session";
import { resolveError } from "@/lib/errors";
import { isRateLimited } from "@/lib/rate-limit";

/**
 * Authentication Server Actions.
 * Server-side validation is mandatory; safe Arabic error messages are
 * returned to the UI (never internal error details).
 */

export interface LoginState {
  error?: string;
}

/** Returns a safe internal path from `next`, or "/" for anything remote/odd. */
function safeNextPath(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string") return "/";
  const trimmed = raw.trim();
  // Only allow same-origin absolute paths (no protocol, no "//").
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "/";
  return trimmed;
}

export async function loginAction(
  prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  // Throttle the unauthenticated login path to limit online brute-force /
  // credential-stuffing against staff accounts (bcrypt verification is expensive).
  if (await isRateLimited()) {
    return { error: "محاولات كثيرة. حاول مرة أخرى بعد قليل" };
  }

  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صحيحة" };
  }

  const next = safeNextPath(formData.get("next"));

  let token: string;
  try {
    ({ token } = await authenticate(parsed.data.username, parsed.data.password));
  } catch (error) {
    return { error: resolveError(error).userMessage };
  }

  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName(), token, sessionCookieOptions());
  redirect(next);
}

/** Destroys the current session and clears the cookie. */
export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName())?.value;
  if (token) {
    await destroySession(token);
    cookieStore.set(sessionCookieName(), "", {
      ...sessionCookieOptions(),
      maxAge: 0,
    });
  }
  redirect("/login");
}
