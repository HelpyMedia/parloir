/**
 * Which panelists' models failed in a session, for "Try again": those seats
 * get a different model instead of re-running the one that just broke.
 *
 * Read from the session's own turn_failed events. Ownership is checked by the
 * caller (loadHydrationBundle) before this runs.
 */
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sessionEvents } from "@/lib/db/schema";
import type { StreamEvent } from "@/lib/orchestrator/types";
import type { FailedSeat } from "@/lib/session-ui/types";

/** A bad key fails every model alike; swapping models wouldn't help. */
export const NOT_THE_MODELS_FAULT = new Set(["invalid_key"]);

export async function loadFailedSeats(
  sessionId: string,
  seatModels: Record<string, string>,
): Promise<FailedSeat[]> {
  const rows = await db
    .select({ payload: sessionEvents.payload })
    .from(sessionEvents)
    .where(
      and(
        eq(sessionEvents.sessionId, sessionId),
        sql`${sessionEvents.payload}->>'type' IN ('turn_failed', 'turn_complete')`,
      ),
    )
    .orderBy(asc(sessionEvents.seq));

  // Latest failure per panelist wins; answering afterwards clears it.
  const bySpeaker = new Map<string, FailedSeat>();
  for (const { payload } of rows) {
    const evt = payload as StreamEvent;
    if (evt.type === "turn_complete") {
      bySpeaker.delete(evt.turn.speakerId);
      continue;
    }
    if (evt.type !== "turn_failed" || NOT_THE_MODELS_FAULT.has(evt.code)) continue;
    const modelId = evt.modelId ?? seatModels[evt.speakerId];
    if (!modelId) continue;
    bySpeaker.set(evt.speakerId, {
      personaId: evt.speakerId,
      personaName: evt.speakerName,
      modelId,
      code: evt.code,
    });
  }
  return [...bySpeaker.values()];
}
