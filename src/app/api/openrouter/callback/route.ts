/**
 * GET /api/openrouter/callback?code=…&state=… — finish "Connect with OpenRouter".
 * Verifies state against the cookie, exchanges the code for the user's key,
 * stores it encrypted, and returns to Settings.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { upsertCredential } from "@/lib/credentials/service";
import {
  OAUTH_COOKIE,
  OAUTH_COOKIE_PATH,
  appOrigin,
  exchangeCode,
  parsePending,
} from "@/lib/credentials/openrouter-oauth";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const pending = parsePending(req.cookies.get(OAUTH_COOKIE)?.value);
  const origin = appOrigin(req.nextUrl.origin);
  const locale = pending?.locale ?? "en";

  const back = (status: "connected" | "error") => {
    const res = NextResponse.redirect(`${origin}/${locale}/settings?openrouter=${status}`);
    res.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return res;
  };

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!pending || !code || state !== pending.state) return back("error");

  try {
    const key = await exchangeCode(code, pending.verifier);
    await upsertCredential(user.id, "openrouter", key);
    return back("connected");
  } catch (err) {
    console.warn("[openrouter oauth] exchange failed", { userId: user.id, err });
    return back("error");
  }
}
