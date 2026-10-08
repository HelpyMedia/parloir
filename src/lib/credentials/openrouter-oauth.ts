/**
 * "Connect with OpenRouter" — OAuth PKCE.
 *
 * The user approves Parloir on openrouter.ai and OpenRouter mints an API key
 * on their account (labelled "Parloir", revocable and capped from their
 * OpenRouter dashboard). We store it exactly like a pasted key.
 * https://openrouter.ai/docs/guides/overview/auth/oauth
 */

import { createHash, randomBytes } from "node:crypto";

export const OAUTH_COOKIE = "parloir_or_oauth";
export const OAUTH_COOKIE_PATH = "/api/openrouter";
const AUTH_URL = "https://openrouter.ai/auth";
const EXCHANGE_URL = "https://openrouter.ai/api/v1/auth/keys";

export interface PendingOAuth {
  verifier: string;
  state: string;
  locale: string;
}

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function newPendingOAuth(locale: string): PendingOAuth {
  return {
    verifier: b64url(randomBytes(32)),
    state: b64url(randomBytes(16)),
    locale: locale === "fr" ? "fr" : "en",
  };
}

export function authorizeUrl(pending: PendingOAuth, callbackUrl: string): string {
  const url = new URL(AUTH_URL);
  url.searchParams.set("callback_url", callbackUrl);
  url.searchParams.set("code_challenge", b64url(createHash("sha256").update(pending.verifier).digest()));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("key_label", "Parloir");
  url.searchParams.set("state", pending.state);
  return url.toString();
}

export function parsePending(raw: string | undefined): PendingOAuth | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingOAuth>;
    if (typeof v.verifier === "string" && typeof v.state === "string") {
      return { verifier: v.verifier, state: v.state, locale: v.locale === "fr" ? "fr" : "en" };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function exchangeCode(code: string, verifier: string): Promise<string> {
  const res = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`openrouter key exchange ${res.status}`);
  const body = (await res.json()) as { key?: unknown };
  if (typeof body.key !== "string" || body.key.length < 10) {
    throw new Error("openrouter key exchange returned no key");
  }
  return body.key;
}

/** Public origin for callbacks; never trust the Host header in production. */
export function appOrigin(fallback: string): string {
  return (process.env.BETTER_AUTH_URL || process.env.NEXT_PUBLIC_APP_URL || fallback).replace(/\/+$/, "");
}
