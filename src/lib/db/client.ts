/**
 * Database client + storage adapter.
 *
 * The storage adapter implements the orchestrator's `Storage` interface
 * (see src/lib/orchestrator/protocol.ts) on top of the Drizzle schema.
 * Keep this file thin — business logic goes in the orchestrator.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { and, asc, eq, inArray } from "drizzle-orm";
import * as schema from "./schema";
import type { Turn, Session } from "@/lib/orchestrator/types";
import type { Storage } from "@/lib/orchestrator/protocol";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse one postgres client across hot reloads in dev.
declare global {
  // eslint-disable-next-line no-var
  var __pg: ReturnType<typeof postgres> | undefined;
}
const client = globalThis.__pg ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalThis.__pg = client;

export const db = drizzle(client, { schema });

// ─── Storage adapter ────────────────────────────────────────────────────────
export const storage: Storage = {
  async appendTurn(turn: Turn) {
    await db.insert(schema.turns).values({
      id: turn.id,
      sessionId: turn.sessionId,
      phase: turn.phase,
      roundNumber: turn.roundNumber,
      turnIndex: turn.turnIndex,
      speakerRole: turn.speakerRole,
      speakerId: turn.speakerId,
      speakerName: turn.speakerName,
      content: turn.content,
      toolCalls: turn.toolCalls ?? [],
      references: turn.references ?? [],
      tokensIn: turn.tokensIn,
      tokensOut: turn.tokensOut,
      costUsd: turn.costUsd,
      model: turn.model,
      createdAt: turn.createdAt,
    });
  },

  async updateSession(id: string, patch: Partial<Session>) {
    const dbPatch: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.currentRound !== undefined) dbPatch.currentRound = patch.currentRound;
    if (patch.completedAt !== undefined) dbPatch.completedAt = patch.completedAt;
    await db.update(schema.sessions).set(dbPatch).where(eq(schema.sessions.id, id));
  },

  async getTranscript(sessionId: string): Promise<Turn[]> {
    const rows = await db
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.sessionId, sessionId))
      .orderBy(asc(schema.turns.roundNumber), asc(schema.turns.turnIndex));
    return rows.map(
      (r): Turn => ({
        id: r.id,
        sessionId: r.sessionId,
        phase: r.phase,
        roundNumber: r.roundNumber,
        turnIndex: r.turnIndex,
        speakerRole: r.speakerRole,
        speakerId: r.speakerId,
        speakerName: r.speakerName,
        content: r.content,
        toolCalls: r.toolCalls,
        references: r.references,
        tokensIn: r.tokensIn,
        tokensOut: r.tokensOut,
        costUsd: r.costUsd,
        model: r.model,
        createdAt: r.createdAt,
      }),
    );
  },

  async setParticipantSilenced(
    sessionId: string,
    personaIds: string[],
    silenced: boolean,
  ) {
    if (personaIds.length === 0) return;
    await db
      .update(schema.participants)
      .set({ silenced })
      .where(
        and(
          eq(schema.participants.sessionId, sessionId),
          inArray(schema.participants.personaId, personaIds),
        ),
      );
  },
};
