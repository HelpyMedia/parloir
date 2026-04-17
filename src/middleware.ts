import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PROTECTED_PAGES = ["/sessions", "/settings"];
const PROTECTED_API = ["/api/sessions", "/api/credentials"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth =
    PROTECTED_PAGES.some((p) => pathname.startsWith(p)) ||
    PROTECTED_API.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const sessionCookie = getSessionCookie(req);
  if (!sessionCookie) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/sessions/:path*", "/settings/:path*", "/api/sessions/:path*", "/api/credentials/:path*"],
};
