/**
 * Model health: what Parloir has seen each model do, shared across users.
 *
 * OpenRouter gates some free models per app ("only available on agentic
 * harnesses"), and its catalog doesn't say which. The only way to know is to
 * get refused, so the first refusal is recorded here and the model is kept
 * out of default panels and suggestions until it answers again or the
 * restriction ages out. Transient failures (rate limits, overload) only lower
 * a model's reliability rank; they never exclude it.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { modelHealth } from "@/lib/db/schema";
import type { ModelErrorCode } from "@/lib/orchestrator/model-errors";

/** How long a refusal keeps a model out of default panels. */
const RESTRICTION_DAYS = 7;
/** Counters reset after this long, so old outages stop counting. */
const WINDOW_DAYS = 7;
const CACHE_TTL_MS = 60_000;

export type Reliability = "good" | "unknown" | "flaky";

export interface ModelHealth {
  restricted: boolean;
  reliability: Reliability;
}

type OutcomeKind = "ok" | "restricted" | "transient" | "ignored";

/**
 * Which failures say something about the model itself. Key, credit and
 * context problems belong to the user or the request, and a content flag
 * belongs to the prompt.
 */
export function outcomeKind(code: ModelErrorCode | null): OutcomeKind {
  if (code === null) return "ok";
  switch (code) {
    case "model_restricted":
      return "restricted";
    case "rate_limited":
    case "provider_overloaded":
    case "model_unavailable":
    case "timeout":
    case "empty_response":
    case "unknown":
      return "transient";
    default:
      return "ignored";
  }
}

/** Record one turn's outcome. Best-effort: health must never break a debate. */
export async function recordModelOutcome(modelId: string, code: ModelErrorCode | null): Promise<void> {
  const kind = outcomeKind(code);
  if (kind === "ignored" || !modelId) return;
  const ok = kind === "ok";
  try {
    await db.execute(sql`
      INSERT INTO model_health AS h
        (model_id, successes, failures, last_success_at, last_failure_at, last_failure_code,
         restricted_until, restricted_code)
      VALUES (
        ${modelId}, ${ok ? 1 : 0}, ${ok ? 0 : 1},
        ${ok ? sql`now()` : null}, ${ok ? null : sql`now()`}, ${ok ? null : code},
        ${kind === "restricted" ? sql`now() + make_interval(days => ${RESTRICTION_DAYS})` : null},
        ${kind === "restricted" ? code : null}
      )
      ON CONFLICT (model_id) DO UPDATE SET
        successes = CASE WHEN h.window_started_at < now() - make_interval(days => ${WINDOW_DAYS})
                         THEN 0 ELSE h.successes END + EXCLUDED.successes,
        failures = CASE WHEN h.window_started_at < now() - make_interval(days => ${WINDOW_DAYS})
                        THEN 0 ELSE h.failures END + EXCLUDED.failures,
        window_started_at = CASE WHEN h.window_started_at < now() - make_interval(days => ${WINDOW_DAYS})
                                 THEN now() ELSE h.window_started_at END,
        last_success_at = COALESCE(EXCLUDED.last_success_at, h.last_success_at),
        last_failure_at = COALESCE(EXCLUDED.last_failure_at, h.last_failure_at),
        last_failure_code = COALESCE(EXCLUDED.last_failure_code, h.last_failure_code),
        restricted_until = CASE WHEN ${ok} THEN NULL
                                WHEN EXCLUDED.restricted_until IS NOT NULL THEN EXCLUDED.restricted_until
                                ELSE h.restricted_until END,
        restricted_code = CASE WHEN ${ok} THEN NULL
                               WHEN EXCLUDED.restricted_code IS NOT NULL THEN EXCLUDED.restricted_code
                               ELSE h.restricted_code END,
        updated_at = now()
    `);
    cache = null;
  } catch (err) {
    console.warn("[model-health] record failed", { modelId, err });
  }
}

export function reliabilityOf(successes: number, failures: number): Reliability {
  if (failures >= 3 && failures > successes) return "flaky";
  if (successes >= 3 && successes >= failures * 4) return "good";
  return "unknown";
}

let cache: { at: number; map: Map<string, ModelHealth> } | null = null;

/**
 * Health for every model Parloir has seen, keyed by model id
 * ("openrouter/<slug>"). Models never seen are absent: treat as unknown.
 * On a DB error this returns an empty map so pickers degrade to plain ranking.
 */
export async function loadModelHealth(): Promise<Map<string, ModelHealth>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.map;
  const map = new Map<string, ModelHealth>();
  try {
    const rows = await db
      .select({
        modelId: modelHealth.modelId,
        restrictedUntil: modelHealth.restrictedUntil,
        successes: modelHealth.successes,
        failures: modelHealth.failures,
        windowStartedAt: modelHealth.windowStartedAt,
      })
      .from(modelHealth);
    const now = Date.now();
    const windowMs = WINDOW_DAYS * 86_400_000;
    for (const r of rows) {
      const stale = now - r.windowStartedAt.getTime() > windowMs;
      map.set(r.modelId, {
        restricted: r.restrictedUntil !== null && r.restrictedUntil.getTime() > now,
        reliability: stale ? "unknown" : reliabilityOf(r.successes, r.failures),
      });
    }
  } catch (err) {
    console.warn("[model-health] load failed", err);
  }
  cache = { at: Date.now(), map };
  return map;
}
