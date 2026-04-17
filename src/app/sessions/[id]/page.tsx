import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { loadPersona } from "@/lib/personas";
import type {
  ConsensusReport,
  Persona,
  Session,
  SynthesisArtifact,
  Turn,
} from "@/lib/orchestrator/types";
import type { HydrationBundle } from "@/lib/session-ui/types";
import { SessionShell } from "@/components/session/layout/SessionShell";

export const dynamic = "force-dynamic";

async function loadBundle(id: string): Promise<HydrationBundle | null> {
  const sessionRow = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, id),
  });
  if (!sessionRow) return null;

  const participantRows = await db
    .select()
    .from(schema.participants)
    .where(eq(schema.participants.sessionId, id))
    .orderBy(asc(schema.participants.seatIndex));

  const personas: Persona[] = [];
  for (const row of participantRows) {
    try {
      personas.push(await loadPersona(row.personaId));
    } catch {
      personas.push({
        id: row.personaId,
        name: row.personaId,
        role: "Unknown",
        systemPrompt: "",
        model: "",
        temperature: 0.5,
        toolIds: [],
        ragSourceIds: [],
        tags: [],
        ownerId: null,
        visibility: "private",
      });
    }
  }

  const turnRows = await db
    .select()
    .from(schema.turns)
    .where(eq(schema.turns.sessionId, id))
    .orderBy(asc(schema.turns.roundNumber), asc(schema.turns.turnIndex));

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

  const consensusRows = await db
    .select()
    .from(schema.consensusReports)
    .where(eq(schema.consensusReports.sessionId, id))
    .orderBy(asc(schema.consensusReports.afterRound));
  const allConsensus: ConsensusReport[] = consensusRows.map(
    (r) => r.report as ConsensusReport,
  );

  const [artifactRow] = await db
    .select()
    .from(schema.artifacts)
    .where(
      and(eq(schema.artifacts.sessionId, id), eq(schema.artifacts.type, "synthesis")),
    )
    .orderBy(desc(schema.artifacts.createdAt))
    .limit(1);

  let synthesis: SynthesisArtifact | null = null;
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

  const [lastEvent] = await db
    .select({ seq: schema.sessionEvents.seq })
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.sessionId, id))
    .orderBy(desc(schema.sessionEvents.seq))
    .limit(1);

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
    // DB column added in Task 11; default to empty until then.
    participantModelOverrides: {},
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
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await loadBundle(id);
  if (!bundle) notFound();
  return <SessionShell bundle={bundle} />;
}
