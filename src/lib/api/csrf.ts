/**
 * Same-origin check for mutating API routes.
 *
 * Better Auth sets SameSite=Lax on the session cookie, which blocks most
 * cross-site CSRF. This adds belt-and-braces by comparing the Origin (or
 * Referer, when Origin is absent) header against BETTER_AUTH_URL. Call
 * from every POST/DELETE/PATCH/PUT handler; GETs are exempt.
 */

import { NextResponse, type NextRequest } from "next/server";

function expectedOrigin(): string | null {
  const raw = process.env.BETTER_AUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

function headerOrigin(req: NextRequest): string | null {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return null;
    }
  }
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Returns a NextResponse with 403 if the request is cross-origin, or null
 * when same-origin (allowed to proceed).
 */
export function assertSameOrigin(req: NextRequest): NextResponse | null {
  const expected = expectedOrigin();
  // If we can't determine the expected origin (misconfigured env), fail
  // closed in production and open in dev where the env may be unset.
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "csrf_check_failed" },
        { status: 403 },
      );
    }
    return null;
  }
  const got = headerOrigin(req);
  if (got === null) {
    // No Origin or Referer header. Same-origin fetches from modern browsers
    // always send Origin on POST, so treat absence as suspicious.
    return NextResponse.json(
      { error: "csrf_check_failed" },
      { status: 403 },
    );
  }
  if (got !== expected) {
    return NextResponse.json(
      { error: "csrf_check_failed" },
      { status: 403 },
    );
  }
  return null;
}
