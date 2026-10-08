/**
 * GET /api/openrouter/connect?locale=fr — start "Connect with OpenRouter".
 * Stores the PKCE verifier + state in a short-lived httpOnly cookie and
 * redirects to openrouter.ai.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  appOrigin,
  authorizeUrl,
  newPendingOAuth,
} from "@/lib/credentials/openrouter-oauth";

export async function GET(req: NextRequest) {
  await requireUser();
  const pending = newPendingOAuth(req.nextUrl.searchParams.get("locale") ?? "en");
  const callback = `${appOrigin(req.nextUrl.origin)}/api/openrouter/callback`;

  const res = NextResponse.redirect(authorizeUrl(pending, callback));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify(pending), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax: the cookie must survive the top-level redirect back from openrouter.ai.
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: 10 * 60, // OpenRouter codes expire after 10 minutes too.
  });
  return res;
}
