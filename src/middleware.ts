import { NextResponse, type NextRequest } from "next/server";
import { sessionCookieName } from "@/lib/auth/session";

/**
 * Route protection (lightweight).
 *
 * This middleware performs a fast, Edge-safe check that a session cookie is
 * present and redirects anonymous visitors to the Arabic login page. It is a
 * UX/perf gate ONLY — the secure boundary is the (dashboard) layout + Server
 * Action + service authorization, which validate the session against the
 * database server-side. Never rely on this middleware alone.
 */

const PUBLIC_PREFIXES = ["/login", "/api", "/_next"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isPublic && !request.cookies.get(sessionCookieName())?.value) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
