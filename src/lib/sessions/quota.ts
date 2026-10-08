/**
 * Per-user session quota.
 *
 * Users pay their own model costs, but every debate still uses our
 * database and workflow runner. These caps keep one account (or a script
 * with a stolen session cookie) from exhausting shared infrastructure.
 * Counted straight from the sessions table, so they hold across every app
 * instance without a shared rate-limit store.
 *
 *   PARLOIR_MAX_SESSIONS_PER_DAY      default 40 hosted, unlimited self-hosted
 *   PARLOIR_MAX_CONCURRENT_SESSIONS   default 2 hosted, unlimited self-hosted
 */

import { and, eq, gte, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { isHosted } from "@/lib/config/edition";

function limitFromEnv(name: string, hostedDefault: number): number | null {
  const raw = process.env[name];
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return isHosted() ? hostedDefault : null;
}

export type QuotaResult =
  | { ok: true }
  | { ok: false; code: "daily_limit" | "concurrent_limit"; message: string };

const FINISHED = ["completed", "failed", "aborted", "setup"] as const;
/** A run untouched for this long is treated as dead, not running. */
const STALE_AFTER = sql`now() - interval '2 hours'`;

export async function checkSessionQuota(userId: string): Promise<QuotaResult> {
  const perDay = limitFromEnv("PARLOIR_MAX_SESSIONS_PER_DAY", 40);
  const concurrent = limitFromEnv("PARLOIR_MAX_CONCURRENT_SESSIONS", 2);

  if (perDay !== null) {
    const created = await db.$count(
      schema.sessions,
      and(
        eq(schema.sessions.createdBy, userId),
        gte(schema.sessions.createdAt, sql`now() - interval '1 day'`),
      ),
    );
    if (created >= perDay) {
      return {
        ok: false,
        code: "daily_limit",
        message: `You've started ${perDay} debates in the last 24 hours, the daily maximum. Try again later.`,
      };
    }
  }

  if (concurrent !== null) {
    const running = await db.$count(
      schema.sessions,
      and(
        eq(schema.sessions.createdBy, userId),
        notInArray(schema.sessions.status, [...FINISHED]),
        gte(schema.sessions.updatedAt, STALE_AFTER),
      ),
    );
    if (running >= concurrent) {
      return {
        ok: false,
        code: "concurrent_limit",
        message: `You already have ${running} debates running. Wait for one to finish before starting another.`,
      };
    }
  }

  return { ok: true };
}
