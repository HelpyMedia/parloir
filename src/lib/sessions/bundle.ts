/**
 * Hydration bundle for the live session UI: everything the client needs to
 * render before it opens the SSE stream. Shared by the session page (server
 * render) and GET /api/sessions/[id].
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { loadPersona } from "@/lib/personas";
import { getOwnedSession } from "@/lib/sessions/authz";
import type {
  ConsensusReport,
  Persona,
  Session,
  StreamEvent,
  SynthesisArtifact,
  Turn,
} from "@/lib/orchestrator/types";
import type { HydrationBundle } from "@/lib/session-ui/types";

function unknownPersona(id: string): Persona {
  return {
    id,
    name: id,
    role: "Unknown",
    systemPrompt: "",
    model: "",
    temperature: 0.5,
    toolIds: [],
    ragSourceIds: [],
    tags: [],
    ownerId: null,
    visibility: "private",
  };
}

export async function loadHydrationBundle(
  id: string,
  userId: string,
): Promise<HydrationBundle | null> {
  const owned = await getOwnedSession(id, userId);
  if (owned.status !== "ok") return null;
  const sessionRow = owned.session;

  const [participantRows, turnRows, consensusRows, artifactRows, lastEvents] = await Promise.all([
    db
      .select()
      .from(schema.participants)
      .where(eq(schema.participants.sessionId, id))
      .orderBy(asc(schema.participants.seatIndex)),
    db
      .select()
      .from(schema.turns)
      .where(eq(schema.turns.sessionId, id))
      .orderBy(asc(schema.turns.roundNumber), asc(schema.turns.turnIndex)),
    db
      .select()
      .from(schema.consensusReports)
      .where(eq(schema.consensusReports.sessionId, id))
      .orderBy(asc(schema.consensusReports.afterRound)),
    db
      .select()
      .from(schema.artifacts)
      .where(and(eq(schema.artifacts.sessionId, id), eq(schema.artifacts.type, "synthesis")))
      .orderBy(desc(schema.artifacts.createdAt))
      .limit(1),
    db
      .select({ seq: schema.sessionEvents.seq, payload: schema.sessionEvents.payload })
      .from(schema.sessionEvents)
      .where(eq(schema.sessionEvents.sessionId, id))
      .orderBy(desc(schema.sessionEvents.seq))
      .limit(1),
  ]);

  const personas: Persona[] = [];
  for (const row of participantRows) {
    try {
      personas.push(await loadPersona(row.personaId));
    } catch {
      personas.push(unknownPersona(row.personaId));
    }
  }

  const turns: Turn[] = turnRows.map((r) => ({
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
  }));

  const allConsensus = consensusRows.map((r) => r.report as ConsensusReport);

  let synthesis: SynthesisArtifact | null = null;
  const artifactRow = artifactRows[0];
  if (artifactRow) {
    const content = artifactRow.content as Omit<
      SynthesisArtifact,
      "sessionId" | "transcriptMarkdown" | "createdAt"
    >;
    synthesis = {
      ...content,
      sessionId: artifactRow.sessionId,
      transcriptMarkdown: artifactRow.transcriptMarkdown ?? "",
      createdAt: artifactRow.createdAt,
    };
  }

  const lastEvent = lastEvents[0];
  let failure: HydrationBundle["failure"] = null;
  if (sessionRow.status === "failed") {
    const payload = lastEvent?.payload as StreamEvent | undefined;
    failure =
      payload?.type === "error"
        ? { message: payload.message, code: payload.code ?? null }
        : { message: "This debate stopped before it finished.", code: null };
  }

  const session: Session = {
    id: sessionRow.id,
    title: sessionRow.title,
    question: sessionRow.question,
    context: sessionRow.context,
    status: sessionRow.status,
    currentRound: sessionRow.currentRound,
    protocol: sessionRow.protocol,
    createdBy: sessionRow.createdBy,
    createdAt: sessionRow.createdAt,
    updatedAt: sessionRow.updatedAt,
    completedAt: sessionRow.completedAt,
    pauseRequestedAt: sessionRow.pauseRequestedAt ?? null,
    pausedAtPhase: sessionRow.pausedAtPhase ?? null,
    participantModelOverrides: sessionRow.participantModelOverrides ?? {},
  };

  return {
    session,
    personas,
    participantOrder: participantRows.map((r) => r.personaId),
    turns,
    latestConsensus: allConsensus.at(-1) ?? null,
    allConsensus,
    synthesis,
    lastSeq: lastEvent?.seq ?? 0,
    failure,
  };
}
