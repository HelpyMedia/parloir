/**
 * Debate protocol state machine.
 *
 * This is the heart of the product. It implements the RA-CR (Rank-Adaptive
 * Cross-Round) protocol with an opening phase designed for diversity, a
 * critique phase with novelty requirements, a consensus check, and an
 * optional adaptive round. All findings from the MAD (Multi-Agent Debate)
 * research literature are encoded here as protocol rules.
 *
 * Key design principles (grounded in research):
 * - Diversity in Phase 1 matters more than round count — run in parallel, blind.
 * - Hide confidence scores to prevent over-confidence cascades.
 * - Require novelty each turn to prevent sycophantic drift.
 * - Judge-ranked silencing in adaptive round prevents weakest arguments from
 *   dragging down the group.
 * - Hard cap on rounds — cost scales as agents × rounds × context.
 */

import { streamText, generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/providers/registry";
import { loadPersona } from "@/lib/personas";
import { buildToolset } from "@/lib/tools";
import { evaluateConsensus } from "./consensus";
import { synthesize } from "./synthesis";
import type {
  Session,
  Participant,
  Turn,
  Phase,
  StreamEvent,
  ConsensusReport,
} from "./types";

/** Anything that can emit stream events back to the UI. */
export interface StreamSink {
  emit(event: StreamEvent): Promise<void> | void;
}

/** Interface the orchestrator needs from the storage layer. */
export interface Storage {
  appendTurn(turn: Turn): Promise<void>;
  updateSession(id: string, patch: Partial<Session>): Promise<void>;
  getTranscript(sessionId: string): Promise<Turn[]>;
  setParticipantSilenced(
    sessionId: string,
    personaIds: string[],
    silenced: boolean,
  ): Promise<void>;
}

// ─── Phase 1: Opening statements ────────────────────────────────────────────
/**
 * All agents answer the question independently, in parallel, with no visibility
 * into each other's answers. This is CRITICAL — it preserves the diversity that
 * makes the debate useful. If agents see each other too early, they converge
 * prematurely (conformity collapse).
 */
export async function runOpeningPhase(
  session: Session,
  participants: Participant[],
  storage: Storage,
  sink: StreamSink,
): Promise<Turn[]> {
  await sink.emit({ type: "phase_enter", phase: "opening", round: 0 });

  // Run all participants in parallel — they don't see each other.
  const turnPromises = participants
    .filter((p) => !p.silenced)
    .map((participant, idx) =>
      runAgentTurn({
        session,
        participant,
        phase: "opening",
        roundNumber: 0,
        turnIndex: idx,
        // In the opening, the only visible history is the question itself.
        visibleHistory: [],
        storage,
        sink,
      }),
    );

  return Promise.all(turnPromises);
}

// ─── Phase 2+: Critique rounds ──────────────────────────────────────────────
/**
 * Sequential round-robin. Each agent sees all prior turns (opening + previous
 * critique rounds). Each turn MUST do one of three things:
 *   (a) refine its own position with new information,
 *   (b) critique a specific other agent by name, citing their turn, or
 *   (c) concede a point.
 * This novelty requirement prevents sycophantic agreement spirals.
 */
export async function runCritiqueRound(
  session: Session,
  participants: Participant[],
  roundNumber: number,
  storage: Storage,
  sink: StreamSink,
): Promise<Turn[]> {
  await sink.emit({ type: "phase_enter", phase: "critique", round: roundNumber });

  const transcript = await storage.getTranscript(session.id);
  const turns: Turn[] = [];

  // Sequential, not parallel — each agent sees the previous agents' turns this round.
  const activeParticipants = participants
    .filter((p) => !p.silenced)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  for (let idx = 0; idx < activeParticipants.length; idx++) {
    const participant = activeParticipants[idx];
    const turn = await runAgentTurn({
      session,
      participant,
      phase: "critique",
      roundNumber,
      turnIndex: idx,
      visibleHistory: [...transcript, ...turns],
      storage,
      sink,
    });
    turns.push(turn);
  }

  return turns;
}

// ─── Phase 3: Consensus check (judge agent) ─────────────────────────────────
export async function runConsensusCheck(
  session: Session,
  participants: Participant[],
  storage: Storage,
  sink: StreamSink,
): Promise<ConsensusReport> {
  await sink.emit({
    type: "phase_enter",
    phase: "consensus_check",
    round: session.currentRound,
  });

  const transcript = await storage.getTranscript(session.id);
  const report = await evaluateConsensus({
    question: session.question,
    transcript,
    participants,
    judgeModel: session.protocol.judgeModel,
  });

  await sink.emit({ type: "consensus_report", report });
  return report;
}

// ─── Phase 4: Adaptive round (RA-CR) ────────────────────────────────────────
/**
 * Rank-Adaptive Cross-Round: the judge ranks participants by argument quality,
 * silences the weakest one, and reorders speakers so the strongest goes last
 * (gets to respond to everything). Research shows this converges faster than
 * vanilla round-robin debate.
 */
export async function runAdaptiveRound(
  session: Session,
  participants: Participant[],
  report: ConsensusReport,
  storage: Storage,
  sink: StreamSink,
): Promise<Turn[]> {
  await sink.emit({
    type: "phase_enter",
    phase: "adaptive_round",
    round: session.currentRound,
  });

  // Silence the weakest participant for this round.
  await storage.setParticipantSilenced(
    session.id,
    report.silencedForNextRound,
    true,
  );

  // Reorder: weakest silenced, strongest speaks last.
  const rankMap = new Map(
    report.participantRanking.map((r) => [r.personaId, r.score]),
  );
  const reordered = participants
    .filter((p) => !report.silencedForNextRound.includes(p.personaId))
    .sort((a, b) => (rankMap.get(a.personaId) ?? 0) - (rankMap.get(b.personaId) ?? 0));

  // Reassign seat index for this round only — storage is unchanged.
  const reseated = reordered.map((p, i) => ({ ...p, seatIndex: i }));

  return runCritiqueRound(session, reseated, session.currentRound, storage, sink);
}

// ─── Phase 5: Synthesis (secretary) ─────────────────────────────────────────
export async function runSynthesis(
  session: Session,
  storage: Storage,
  sink: StreamSink,
) {
  await sink.emit({ type: "phase_enter", phase: "synthesis", round: session.currentRound });

  const transcript = await storage.getTranscript(session.id);
  const artifact = await synthesize({
    session,
    transcript,
    synthesizerModel: session.protocol.synthesizerModel,
    sink,
  });

  await sink.emit({ type: "synthesis_complete", artifact });
  return artifact;
}

// ─── Top-level: run the full debate ─────────────────────────────────────────
export async function runDebate(
  session: Session,
  participants: Participant[],
  storage: Storage,
  sink: StreamSink,
) {
  try {
    // Phase 1: parallel blind opening
    await storage.updateSession(session.id, { status: "opening", currentRound: 0 });
    await runOpeningPhase(session, participants, storage, sink);

    // Phase 2..N: critique rounds with consensus checks
    let consensusReached = false;
    for (
      let round = 1;
      round <= session.protocol.maxCritiqueRounds && !consensusReached;
      round++
    ) {
      await storage.updateSession(session.id, { status: "critique", currentRound: round });
      await runCritiqueRound(session, participants, round, storage, sink);

      const report = await runConsensusCheck(session, participants, storage, sink);

      if (report.consensusLevel >= session.protocol.consensusThreshold) {
        consensusReached = true;
      } else if (
        report.recommendation === "another_round" &&
        session.protocol.enableAdaptiveRound &&
        round === session.protocol.maxCritiqueRounds
      ) {
        // Last round and still no consensus — try the adaptive reshuffle.
        await storage.updateSession(session.id, {
          status: "adaptive_round",
          currentRound: round + 1,
        });
        await runAdaptiveRound(session, participants, report, storage, sink);
        break;
      }
    }

    // Phase 5: synthesis
    await storage.updateSession(session.id, { status: "synthesis" });
    await runSynthesis(session, storage, sink);

    await storage.updateSession(session.id, {
      status: "completed",
      completedAt: new Date(),
    });
  } catch (err) {
    await storage.updateSession(session.id, { status: "failed" });
    await sink.emit({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
      recoverable: false,
    });
    throw err;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
async function runAgentTurn(params: {
  session: Session;
  participant: Participant;
  phase: Phase;
  roundNumber: number;
  turnIndex: number;
  visibleHistory: Turn[];
  storage: Storage;
  sink: StreamSink;
}): Promise<Turn> {
  const { session, participant, phase, roundNumber, turnIndex, visibleHistory, storage, sink } =
    params;

  const persona = await loadPersona(participant.personaId);
  const model = resolveModel(persona.model);
  const tools = await buildToolset(persona.toolIds, session.id);

  await sink.emit({
    type: "turn_start",
    speakerId: persona.id,
    speakerName: persona.name,
    phase,
  });

  // Compose the prompt. For the opening phase, no visible history —
  // just the question and the persona's role.
  const messages = buildMessages({
    session,
    persona,
    phase,
    roundNumber,
    visibleHistory,
    hideConfidence: session.protocol.hideConfidenceScores,
    requireNovelty: session.protocol.requireNovelty && phase !== "opening",
  });

  const result = await streamText({
    model,
    messages,
    temperature: persona.temperature,
    tools,
    // TODO: prompt caching — set cache control on system messages to reduce costs.
  });

  let fullText = "";
  for await (const delta of result.textStream) {
    fullText += delta;
    await sink.emit({ type: "turn_delta", speakerId: persona.id, textDelta: delta });
  }

  const usage = await result.usage;
  const turn: Turn = {
    id: crypto.randomUUID(),
    sessionId: session.id,
    phase,
    roundNumber,
    turnIndex,
    speakerRole: "agent",
    speakerId: persona.id,
    speakerName: persona.name,
    content: fullText,
    references: extractReferences(fullText, visibleHistory),
    tokensIn: usage.promptTokens ?? 0,
    tokensOut: usage.completionTokens ?? 0,
    costUsd: 0, // TODO: compute from provider's returned cost metadata
    model: persona.model,
    createdAt: new Date(),
  };

  await storage.appendTurn(turn);
  await sink.emit({ type: "turn_complete", turn });
  return turn;
}

function buildMessages(params: {
  session: Session;
  persona: Awaited<ReturnType<typeof loadPersona>>;
  phase: Phase;
  roundNumber: number;
  visibleHistory: Turn[];
  hideConfidence: boolean;
  requireNovelty: boolean;
}) {
  const { session, persona, phase, roundNumber, visibleHistory, hideConfidence, requireNovelty } =
    params;

  const systemParts = [persona.systemPrompt];

  if (hideConfidence) {
    systemParts.push(
      "Do not mention confidence scores, percentages, or phrases like " +
        '"I\'m X% sure". State your position and reasoning without quantified certainty.',
    );
  }

  if (phase === "opening") {
    systemParts.push(
      "This is your OPENING STATEMENT. You have not yet seen what other participants think. " +
        "Answer the question from your own perspective and expertise. Be specific and substantive.",
    );
  } else if (phase === "critique") {
    systemParts.push(
      `This is CRITIQUE ROUND ${roundNumber}. You can see everyone's prior statements. ` +
        "You MUST do ONE of the following: " +
        "(a) Refine your position with NEW reasoning or evidence you haven't given before, OR " +
        "(b) Critique a SPECIFIC participant by name, citing their actual argument, OR " +
        "(c) Explicitly concede a point someone else made and explain why you changed your mind. " +
        "Do NOT simply agree or restate. Do NOT be sycophantic. Bring something the group doesn't have yet.",
    );
  } else if (phase === "adaptive_round") {
    systemParts.push(
      "This is the FINAL ADAPTIVE ROUND. The moderator has identified that consensus wasn't " +
        "reached. Speak last-word style: address the strongest opposing arguments head-on and " +
        "commit to a final position.",
    );
  }

  const userParts: string[] = [
    `QUESTION FOR DELIBERATION:\n${session.question}`,
  ];
  if (session.context) {
    userParts.push(`BACKGROUND CONTEXT:\n${session.context}`);
  }
  if (visibleHistory.length > 0) {
    userParts.push(`TRANSCRIPT SO FAR:\n${formatTranscript(visibleHistory)}`);
  }

  return [
    { role: "system" as const, content: systemParts.join("\n\n") },
    { role: "user" as const, content: userParts.join("\n\n---\n\n") },
  ];
}

function formatTranscript(turns: Turn[]): string {
  return turns
    .map((t) => {
      const phaseLabel =
        t.phase === "opening"
          ? "Opening"
          : t.phase === "critique"
            ? `Round ${t.roundNumber}`
            : t.phase;
      return `[${phaseLabel}] ${t.speakerName}:\n${t.content}`;
    })
    .join("\n\n");
}

/** Best-effort extraction of turn references ("as X said in round 1"). */
function extractReferences(text: string, history: Turn[]): string[] {
  const refs = new Set<string>();
  for (const turn of history) {
    if (text.toLowerCase().includes(turn.speakerName.toLowerCase())) {
      refs.add(turn.id);
    }
  }
  return [...refs];
}
