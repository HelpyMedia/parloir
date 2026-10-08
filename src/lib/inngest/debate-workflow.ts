/**
 * The durable debate workflow.
 *
 * Why Inngest: a debate takes several minutes, longer than a serverless
 * request may live. Every turn, consensus check and phase transition runs as
 * its own Inngest step (see src/lib/orchestrator/durable.ts), so each HTTP
 * invocation stays short and nothing is re-run after a pause or a crash.
 *
 * Streaming: Inngest steps can't stream to the browser. Each stream event is
 * appended to the `session_events` table and the SSE endpoint
 * (app/api/sessions/[id]/stream/route.ts) tails it. The user can close the
 * tab and the debate continues.
 *
 * Event flow:
 *   POST /api/sessions/[id]/start ──> inngest event "debate.requested"
 *   Inngest runs runDebate() step by step, writing StreamEvents to Postgres.
 *   The SSE endpoint reads them and pipes them to the browser.
 */

import { inngest } from "./client";
import { runDebate } from "@/lib/orchestrator/protocol";
import { loadProviderContext } from "@/lib/credentials/context";
import { createInngestControlPlane } from "./control-plane";
import { storage, db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { Durable } from "@/lib/orchestrator/durable";
import type { Session, Participant, StreamEvent } from "@/lib/orchestrator/types";

export const startDebate = inngest.createFunction(
  {
    id: "start-debate",
    name: "Start debate",
    // One run per session, ever: a duplicate start event within 24h is
    // dropped. (A per-session concurrency limit would also serialize the
    // parallel opening statements, which are separate steps.)
    idempotency: "event.data.sessionId",
    // Steps retry on infrastructure errors (DB blips, a killed invocation).
    // Model errors never reach this: turns record them and carry on.
    retries: 2,
  },
  { event: "debate.requested" },
  async ({ event, step }) => {
    const { sessionId } = event.data as { sessionId: string };

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

    // step.run results are JSON-serialized; re-hydrate Dates.
    const session: Session = {
      ...loaded.sessionRow,
      createdAt: new Date(loaded.sessionRow.createdAt),
      updatedAt: new Date(loaded.sessionRow.updatedAt),
      completedAt: loaded.sessionRow.completedAt ? new Date(loaded.sessionRow.completedAt) : null,
      pauseRequestedAt: loaded.sessionRow.pauseRequestedAt
        ? new Date(loaded.sessionRow.pauseRequestedAt)
        : null,
      pausedAtPhase: loaded.sessionRow.pausedAtPhase ?? null,
    } as unknown as Session;
    const participants = loaded.participantRows as unknown as Participant[];

    // Credentials are decrypted on every invocation instead of being stored
    // as a step result: step outputs are persisted by Inngest, and API keys
    // must never leave our database.
    const providerContext = await loadProviderContext(session.createdBy);

    const durable: Durable = {
      step: <T>(id: string, fn: () => Promise<T>) =>
        step.run(id, fn) as unknown as Promise<T>,
    };

    const result = await runDebate(session, participants, {
      ctx: providerContext,
      storage,
      sink: { emit: (evt: StreamEvent) => appendStreamEvent(sessionId, evt) },
      controlPlane: createInngestControlPlane(step, sessionId),
      durable,
    });

    return { sessionId, status: result.status };
  },
);

// ─── Stream event queue (DB-backed pub/sub) ─────────────────────────────────
// seq is per-session monotonic. The opening phase fans out agents in
// parallel, so MAX(seq)+1 alone is racy; a per-session advisory lock inside
// the transaction serializes concurrent writers for the same session only.
async function appendStreamEvent(sessionId: string, event: StreamEvent) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`);
    await tx.insert(schema.sessionEvents).values({
      sessionId,
      seq: sql<number>`COALESCE((SELECT MAX(${schema.sessionEvents.seq}) FROM ${schema.sessionEvents} WHERE ${schema.sessionEvents.sessionId} = ${sessionId}), 0) + 1`,
      payload: event,
    });
  });
}

export const handlers = [startDebate];
