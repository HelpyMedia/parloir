/**
 * The durable debate workflow.
 *
 * Why Inngest: a 3-agent × 3-round debate easily takes 3-5 minutes. Vercel's
 * serverless limit is 300s (Pro) / 800s (Enterprise). Inngest runs each phase
 * as a separate durable "step" — if the process dies, Inngest resumes from
 * the last completed step without re-running it.
 *
 * Streaming: Inngest steps can't natively stream to the client. We solve this
 * by emitting each stream event into a Postgres-backed event queue (table:
 * `session_events`). The SSE endpoint (app/api/sessions/[id]/stream/route.ts)
 * polls/subscribes to that queue. This decouples the long-running workflow
 * from any one HTTP connection — the user can close their tab and the debate
 * continues.
 *
 * Event flow:
 *   Next.js API /sessions/[id]/start  ──triggers──>  inngest event "debate.requested"
 *   Inngest worker picks it up, runs runDebate(), pushing StreamEvents into the
 *   events table as it goes.
 *   SSE endpoint reads the events table and pipes to the browser.
 */

import { inngest } from "./client";
import { runDebate } from "@/lib/orchestrator/protocol";
import { loadProviderContext } from "@/lib/credentials/context";
import { createInngestControlPlane } from "./control-plane";
import { storage, db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Session, Participant, StreamEvent } from "@/lib/orchestrator/types";

export const startDebate = inngest.createFunction(
  {
    id: "start-debate",
    name: "Start debate",
    // Cap concurrency per session so a "resume" event doesn't double-run.
    concurrency: { key: "event.data.sessionId", limit: 1 },
    // Retry once on failure; the workflow is idempotent at the phase level.
    retries: 1,
  },
  { event: "debate.requested" },
  async ({ event, step }) => {
    const { sessionId } = event.data as { sessionId: string };

    // Step 1: load session + participants (deterministic, cheap)
    const loaded = await step.run("load-session", async () => {
      const sessionRow = await db.query.sessions.findFirst({
        where: eq(schema.sessions.id, sessionId),
      });
      if (!sessionRow) throw new Error(`Session ${sessionId} not found`);

      const participantRows = await db.query.participants.findMany({
        where: eq(schema.participants.sessionId, sessionId),
      });

      return { sessionRow, participantRows };
    });

    // Inngest JSON-serializes step.run return values, so Date fields arrive
    // as strings. Re-hydrate before handing to the orchestrator, which expects
    // Date instances per the Session type.
    const session: Session = {
      ...loaded.sessionRow,
      createdAt: new Date(loaded.sessionRow.createdAt),
      updatedAt: new Date(loaded.sessionRow.updatedAt),
      completedAt: loaded.sessionRow.completedAt
        ? new Date(loaded.sessionRow.completedAt)
        : null,
      pauseRequestedAt: loaded.sessionRow.pauseRequestedAt
        ? new Date(loaded.sessionRow.pauseRequestedAt)
        : null,
      pausedAtPhase: loaded.sessionRow.pausedAtPhase ?? null,
    } as unknown as Session;
    const participants = loaded.participantRows as unknown as Participant[];

    // Step 2: load the session owner's provider credentials. This runs as a
    // separate durable step so that if the workflow resumes after a crash,
    // credentials are re-fetched from the DB rather than replayed from a
    // potentially stale Inngest checkpoint.
    const providerContext = await step.run("load-credentials", async () => {
      return await loadProviderContext(session.createdBy);
    });

    // If the user has no cloud keys stored and no local URLs configured,
    // PARLOIR_DEV_INHERIT_ENV=1 in the registry will fall back to process.env
    // API keys, which is the correct behaviour for local dev. Warn but proceed.
    const hasCloudKeys = Object.keys(providerContext.cloud).length > 0;
    const hasLocalUrls = Object.keys(providerContext.local).length > 0;
    if (!hasCloudKeys && !hasLocalUrls) {
      console.warn(
        `[debate-workflow] No stored credentials for user ${session.createdBy}. ` +
          "Falling back to process.env via PARLOIR_DEV_INHERIT_ENV shim.",
      );
    }

    // Run the debate directly (no step.run wrapper). step.waitForEvent inside
    // the control plane must be called at the top level of the function body;
    // nested step.* calls are not legal in Inngest. Trade-off: a catastrophic
    // crash re-runs the whole debate from the start — acceptable because we
    // already accept that at the phase level today, and durable pause is worth
    // the downgrade. Finer-grained resumability is a future roadmap item.
    const controlPlane = createInngestControlPlane(step, sessionId);
    await runDebate(
      session,
      participants,
      providerContext,
      storage,
      {
        async emit(evt: StreamEvent) {
          await appendStreamEvent(sessionId, evt);
        },
      },
      controlPlane,
    );

    return { sessionId, completedAt: new Date().toISOString() };
  },
);

// ─── Stream event queue (DB-backed pub/sub) ─────────────────────────────────
// seq is per-session monotonic. Inngest concurrency:1 keeps workflow runs
// serial, but within one run the opening phase fans out agents in parallel,
// so MAX(seq)+1 alone is racy. A per-session advisory lock inside the
// transaction serializes concurrent writers for the same session only.
async function appendStreamEvent(sessionId: string, event: StreamEvent) {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`,
    );
    await tx.insert(schema.sessionEvents).values({
      sessionId,
      seq: sql<number>`COALESCE((SELECT MAX(${schema.sessionEvents.seq}) FROM ${schema.sessionEvents} WHERE ${schema.sessionEvents.sessionId} = ${sessionId}), 0) + 1`,
      payload: event,
    });
  });
}

export const handlers = [startDebate];
