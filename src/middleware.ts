import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const intlMiddleware = createIntlMiddleware(routing);

// Protected locale-prefixed pages and API paths. API paths are NOT locale-prefixed.
const PROTECTED_PAGE_RE = /^\/(en|fr)\/(sessions|settings)(\/.*)?$/;
const PROTECTED_API = ["/api/sessions", "/api/credentials", "/api/providers"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // API routes: no locale, just auth gate.
  if (pathname.startsWith("/api/")) {
    if (PROTECTED_API.some((p) => pathname.startsWith(p))) {
      const sessionCookie = getSessionCookie(req);
      if (!sessionCookie) {
        return NextResponse.json(
          { error: "unauthenticated" },
          { status: 401 },
        );
      }
    }
    return NextResponse.next();
  }

  // Page routes: first run next-intl to normalize locale.
  const intlResponse = intlMiddleware(req);

  if (PROTECTED_PAGE_RE.test(pathname)) {
    const sessionCookie = getSessionCookie(req);
    if (!sessionCookie) {
      const locale = pathname.split("/")[1] || routing.defaultLocale;
      const url = req.nextUrl.clone();
      url.pathname = `/${locale}/signin`;
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }

  return intlResponse;
}

export const config = {
  matcher: [
    // Run on all non-internal paths except files with extensions.
    "/((?!_next|.*\\..*).*)",
  ],
};
