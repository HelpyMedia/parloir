/**
 * In-process token-bucket rate limiter.
 *
 * Single-instance only — resets on restart and is not shared across
 * serverless instances. Good enough for sign-up / sign-in brute-force
 * deterrence and for capping bursts on mutating endpoints. Replace with a
 * Redis-backed limiter when deploying to multi-instance infra.
 *
 * Lazy refill (no setInterval): we compute how many tokens should have
 * refilled since the last touch and top up on each call, up to the bucket's
 * capacity.
 */

import { NextResponse, type NextRequest } from "next/server";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export interface LimitConfig {
  capacity: number;
  refillPerSec: number;
}

export interface LimitResult {
  ok: boolean;
  retryAfterMs: number;
}

export function limit(key: string, cfg: LimitConfig): LimitResult {
  const now = Date.now();
  const existing = buckets.get(key);
  const bucket: Bucket = existing ?? { tokens: cfg.capacity, lastRefill: now };
  if (existing) {
    const elapsedSec = Math.max(0, (now - existing.lastRefill) / 1000);
    bucket.tokens = Math.min(
      cfg.capacity,
      existing.tokens + elapsedSec * cfg.refillPerSec,
    );
    bucket.lastRefill = now;
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(key, bucket);
    return { ok: true, retryAfterMs: 0 };
  }
  buckets.set(key, bucket);
  const deficit = 1 - bucket.tokens;
  const retryAfterMs = Math.ceil((deficit / cfg.refillPerSec) * 1000);
  return { ok: false, retryAfterMs };
}

function clientIp(req: NextRequest): string {
  const trusted = trustedForwardedIp(req);
  if (trusted) return trusted;
  return "unknown";
}

function shouldTrustProxyHeaders(): boolean {
  return process.env.VERCEL === "1" || process.env.PARLOIR_TRUST_PROXY_HEADERS === "1";
}

function trustedForwardedIp(req: Request | NextRequest): string | null {
  if (!shouldTrustProxyHeaders()) return null;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return null;
}

/**
 * Wrap an API handler with rate limiting. Key is `${scope}:${userId ?? ip}`.
 * Returns 429 with Retry-After when the bucket is empty.
 */
export async function withRateLimit<T>(
  req: NextRequest,
  scope: string,
  cfg: LimitConfig,
  subject: string | null,
  handler: () => Promise<T>,
): Promise<T | NextResponse> {
  const key = `${scope}:${subject ?? clientIp(req)}`;
  const result = limit(key, cfg);
  if (!result.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
      },
    );
  }
  return handler();
}

// Convenience presets tuned for this app.
export const RATE_LIMITS = {
  authAttempt: { capacity: 10, refillPerSec: 10 / 60 }, // 10/min, per IP
  credentialTest: { capacity: 10, refillPerSec: 10 / 60 }, // 10/min, per user
  sessionWrite: { capacity: 10, refillPerSec: 10 / 60 }, // 10/min, per user
  inject: { capacity: 20, refillPerSec: 20 / 60 }, // 20/min, per user
} as const;

/** Extract client IP (exposed for Better Auth hook use). */
export function getClientIp(req: Request | NextRequest): string {
  const trusted = trustedForwardedIp(req);
  if (trusted) return trusted;
  return "unknown";
}
