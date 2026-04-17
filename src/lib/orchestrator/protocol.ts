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

import { streamText, stepCountIs } from "ai";
import { resolveModel } from "@/lib/providers/registry";
import {
  pickJudgeModelChain,
  pickSynthesizerModelChain,
} from "@/lib/providers/defaults";
import { loadPersona } from "@/lib/personas";
import { buildToolset } from "@/lib/tools";
import { evaluateConsensus } from "./consensus";
import { extractCostUsd } from "./pricing";
import { synthesize } from "./synthesis";
import type {
  Session,
  Participant,
  Turn,
  Phase,
  StreamEvent,
  ConsensusReport,
  SynthesisArtifact,
  ProviderContext,
} from "./types";
import type { ControlPlane } from "./control";

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
  appendArtifact(artifact: SynthesisArtifact): Promise<void>;
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
  ctx: ProviderContext,
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
        ctx,
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
  ctx: ProviderContext,
  roundNumber: number,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
): Promise<Turn[]> {
  await sink.emit({ type: "phase_enter", phase: "critique", round: roundNumber });

  // Sequential, not parallel — each agent sees the previous agents' turns this round.
  const activeParticipants = participants
    .filter((p) => !p.silenced)
    .sort((a, b) => a.seatIndex - b.seatIndex);

  const results: Turn[] = [];

  for (let i = 0; i < activeParticipants.length; i++) {
    // Between-turn control point: if the user hit pause while the previous
    // speaker was streaming, we honor it here rather than waiting for the
    // whole round to finish. Any injection queued during the pause is
    // appended to the transcript and becomes visible to the next speaker.
    if (i > 0) {
      await drainInjectionsAndWait(
        session,
        "critique",
        storage,
        sink,
        controlPlane,
      );
    }

    const transcript = await storage.getTranscript(session.id);
    const turnIndex = transcript.filter(
      (t) => t.phase === "critique" && t.roundNumber === roundNumber,
    ).length;

    const turn = await runAgentTurn({
      session,
      participant: activeParticipants[i],
      ctx,
      phase: "critique",
      roundNumber,
      turnIndex,
      visibleHistory: transcript,
      storage,
      sink,
    });
    results.push(turn);
  }

  return results;
}

/**
 * Resolve the actual model ID each participant uses, honoring per-session
 * overrides. Matches the resolution in runAgentTurn so the judge/synth
 * fallback chain sees the same "known-good" list the debate ran on.
 */
async function resolveParticipantModels(
  session: Session,
  participants: Participant[],
): Promise<string[]> {
  const out: string[] = [];
  for (const p of participants) {
    const persona = await loadPersona(p.personaId);
    const override = session.participantModelOverrides?.[persona.id];
    out.push(override ?? persona.model);
  }
  return out;
}

// ─── Phase 3: Consensus check (judge agent) ─────────────────────────────────
export async function runConsensusCheck(
  session: Session,
  participants: Participant[],
  ctx: ProviderContext,
  storage: Storage,
  sink: StreamSink,
): Promise<ConsensusReport> {
  await sink.emit({
    type: "phase_enter",
    phase: "consensus_check",
    round: session.currentRound,
  });

  const transcript = await storage.getTranscript(session.id);
  const personaModels = await resolveParticipantModels(session, participants);
  const judgeModelChain = pickJudgeModelChain(
    session.protocol.judgeModel,
    ctx,
    personaModels,
  );
  const report = await evaluateConsensus({
    question: session.question,
    transcript,
    participants,
    judgeModelChain,
    ctx,
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
  ctx: ProviderContext,
  report: ConsensusReport,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
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

  return runCritiqueRound(
    session,
    reseated,
    ctx,
    session.currentRound,
    storage,
    sink,
    controlPlane,
  );
}

// ─── Phase 5: Synthesis (secretary) ─────────────────────────────────────────
export async function runSynthesis(
  session: Session,
  participants: Participant[],
  ctx: ProviderContext,
  storage: Storage,
  sink: StreamSink,
) {
  await sink.emit({ type: "phase_enter", phase: "synthesis", round: session.currentRound });

  const transcript = await storage.getTranscript(session.id);
  const personaModels = await resolveParticipantModels(session, participants);
  const synthesizerModelChain = pickSynthesizerModelChain(
    session.protocol.synthesizerModel,
    ctx,
    personaModels,
  );
  const artifact = await synthesize({
    session,
    transcript,
    synthesizerModelChain,
    ctx,
    sink,
  });

  await storage.appendArtifact(artifact);
  await sink.emit({ type: "synthesis_complete", artifact });
  return artifact;
}

// ─── Top-level: run the full debate ─────────────────────────────────────────
export async function runDebate(
  session: Session,
  participants: Participant[],
  ctx: ProviderContext,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
) {
  try {
    // Phase 1: parallel blind opening. We DO NOT drain injections before
    // opening — agents must start blind. We drain after, before critique.
    await storage.updateSession(session.id, { status: "opening", currentRound: 0 });
    session.currentRound = 0;
    await runOpeningPhase(session, participants, ctx, storage, sink);

    await drainInjectionsAndWait(session, "opening", storage, sink, controlPlane);

    // Phase 2..N: critique rounds with consensus checks
    let consensusReached = false;
    for (
      let round = 1;
      round <= session.protocol.maxCritiqueRounds && !consensusReached;
      round++
    ) {
      await storage.updateSession(session.id, { status: "critique", currentRound: round });
      // Refresh in-memory currentRound so drain places human turns in this round.
      session.currentRound = round;
      await runCritiqueRound(
        session,
        participants,
        ctx,
        round,
        storage,
        sink,
        controlPlane,
      );

      await drainInjectionsAndWait(session, "critique", storage, sink, controlPlane);

      const report = await runConsensusCheck(session, participants, ctx, storage, sink);

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
        session.currentRound = round + 1;
        await drainInjectionsAndWait(
          session,
          "adaptive_round",
          storage,
          sink,
          controlPlane,
        );
        await runAdaptiveRound(
          session,
          participants,
          ctx,
          report,
          storage,
          sink,
          controlPlane,
        );
        break;
      }
    }

    // Phase 5: synthesis
    await drainInjectionsAndWait(session, "synthesis", storage, sink, controlPlane);
    await storage.updateSession(session.id, { status: "synthesis" });
    await runSynthesis(session, participants, ctx, storage, sink);

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
  ctx: ProviderContext;
  phase: Phase;
  roundNumber: number;
  turnIndex: number;
  visibleHistory: Turn[];
  storage: Storage;
  sink: StreamSink;
}): Promise<Turn> {
  const { session, participant, ctx, phase, roundNumber, turnIndex, visibleHistory, storage, sink } =
    params;

  const persona = await loadPersona(participant.personaId);
  // Apply per-persona model override if configured on the session, falling back
  // to the persona's default model. This lets session creators swap models per
  // participant without editing the persona template.
  const overrideModel = session.participantModelOverrides?.[persona.id];
  const modelId = overrideModel ?? persona.model;
  const model = resolveModel(modelId, ctx);
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

  // AI SDK 5 defaults to a single step: if the model calls a tool on step 1,
  // the stream ends with only a tool_use part and zero text. stepCountIs(5)
  // lets the loop continue past the tool result so the model can produce its
  // actual answer. 5 is enough headroom for a couple of research hops without
  // letting a runaway agent thrash.
  const result = streamText({
    model,
    messages,
    temperature: persona.temperature,
    tools,
    stopWhen: stepCountIs(5),
    // OpenRouter returns authoritative cost (USD) in the final usage chunk
    // when this flag is set. Harmless for non-OpenRouter providers (ignored).
    providerOptions: {
      openrouter: { usage: { include: true } },
    },
    // TODO: prompt caching — set cache control on system messages to reduce costs.
  });

  let fullText = "";
  for await (const delta of result.textStream) {
    fullText += delta;
    await sink.emit({ type: "turn_delta", speakerId: persona.id, textDelta: delta });
  }

  const usage = await result.usage;
  const tokensIn = usage.inputTokens ?? 0;
  const tokensOut = usage.outputTokens ?? 0;
  const providerMetadata = await result.providerMetadata;
  const costUsd = extractCostUsd(providerMetadata, modelId, tokensIn, tokensOut);
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
    tokensIn,
    tokensOut,
    costUsd,
    // Record the actual model used (may differ from persona.model if overridden).
    model: modelId,
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
    const base = `This is CRITIQUE ROUND ${roundNumber}. You can see everyone's prior statements. `;
    systemParts.push(
      requireNovelty
        ? base +
            "You MUST do ONE of the following: " +
            "(a) Refine your position with NEW reasoning or evidence you haven't given before, OR " +
            "(b) Critique a SPECIFIC participant by name, citing their actual argument, OR " +
            "(c) Explicitly concede a point someone else made and explain why you changed your mind. " +
            "Do NOT simply agree or restate. Do NOT be sycophantic. Bring something the group doesn't have yet."
        : base +
            "Respond to what others have said and refine your position as you see fit.",
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

// ─── Phase-boundary control point ───────────────────────────────────────────
/**
 * Called between every phase. Appends any queued human injections as human
 * Turns visible to subsequent speakers, then blocks if pause was requested.
 * After a wait, re-drains — a user can submit a note *during* the pause and
 * we want it visible in the very next phase.
 */
async function drainInjectionsAndWait(
  session: Session,
  atPhase: Phase,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
): Promise<void> {
  await drainOnce(session, atPhase, storage, sink, controlPlane);

  if (await controlPlane.isPauseRequested(session.id)) {
    await controlPlane.markPausedAtPhase(session.id, atPhase);
    await storage.updateSession(session.id, { status: "paused" });
    await sink.emit({
      type: "human_injection_request",
      prompt:
        "Deliberation paused. Add a note to steer the next phase, or resume without interjecting.",
    });

    // Once waitIfPauseRequested returns, the pause is resolved either way
    // (a resume signal arrived, or the flag was cleared out-of-band, or the
    // timeout expired). Unconditionally restore the phase status and re-drain
    // so any note submitted during the pause window lands in the next phase.
    await controlPlane.waitIfPauseRequested(session.id);
    await storage.updateSession(session.id, { status: atPhase });
    await drainOnce(session, atPhase, storage, sink, controlPlane);
  }
}

async function drainOnce(
  session: Session,
  atPhase: Phase,
  storage: Storage,
  sink: StreamSink,
  controlPlane: ControlPlane,
): Promise<void> {
  const injections = await controlPlane.drainInjections(session.id);
  if (injections.length === 0) return;

  const transcript = await storage.getTranscript(session.id);
  let turnIndex = transcript.filter(
    (t) => t.phase === atPhase && t.roundNumber === session.currentRound,
  ).length;

  for (const injection of injections) {
    await sink.emit({
      type: "turn_start",
      speakerId: injection.createdBy,
      speakerName: injection.createdByName,
      phase: atPhase,
    });

    const turn: Turn = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      phase: atPhase,
      roundNumber: session.currentRound,
      turnIndex: turnIndex++,
      speakerRole: "human",
      speakerId: injection.createdBy,
      speakerName: injection.createdByName,
      content: injection.content,
      references: [],
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      model: "",
      createdAt: new Date(),
    };

    await storage.appendTurn(turn);
    await sink.emit({ type: "turn_complete", turn });
  }
}
