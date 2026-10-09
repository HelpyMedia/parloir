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
 *
 * Execution model: every side effect runs inside `durable.step` with a
 * deterministic ID (see durable.ts). Code between steps must be pure with
 * respect to memoized step results, because Inngest replays it.
 */

import { pickJudgeModelChain, pickSynthesizerModelChain } from "../providers/defaults";
import { evaluateConsensus } from "./consensus";
import { synthesize } from "./synthesis";
import { loadEvidence, panelModelIds, runAgentTurn } from "./turn";
import { runResearchPhase } from "./research";
import { DebateAbortedError, describeModelError, type ModelErrorCode } from "./model-errors";
import type { Durable } from "./durable";
import type {
  Session,
  Participant,
  Turn,
  Phase,
  StreamEvent,
  ConsensusReport,
  SynthesisArtifact,
  ProviderContext,
  Seats,
  SessionSource,
  ResearchOutcome,
} from "./types";
import type { NewSource } from "../research/sources";
import type { CatalogModel } from "../providers/openrouter-catalog";
import type { ControlPlane } from "./control";
import { assertCanContinue, Roster } from "./roster";
import { phaseBoundary } from "./pause";
import { canFix, pauseForModelFix, turnWithFix, MAX_FIX_ATTEMPTS } from "./model-fix";
import { MAX_FREE_SWAPS, swapFailedFreeSeats, swappable } from "./free-swap";

/** Anything that can emit stream events back to the UI. */
export interface StreamSink {
  emit(event: StreamEvent): Promise<void> | void;
}

/** Interface the orchestrator needs from the storage layer. */
export interface Storage {
  appendTurn(turn: Turn): Promise<void>;
  updateSession(id: string, patch: Partial<Session>): Promise<void>;
  getTranscript(sessionId: string): Promise<Turn[]>;
  setParticipantSilenced(sessionId: string, personaIds: string[], silenced: boolean): Promise<void>;
  appendConsensusReport(sessionId: string, afterRound: number, report: ConsensusReport): Promise<void>;
  appendArtifact(artifact: SynthesisArtifact): Promise<void>;
  /** Current panel models and removed panelists; re-read after every pause. */
  loadSeats(sessionId: string): Promise<Seats>;
  /** Best-effort record of how a model did on one turn (null code = answered). Never throws. */
  recordModelOutcome(modelId: string, code: ModelErrorCode | null): Promise<void>;
  /**
   * Register web pages in the session's source registry and return the entry
   * for each one. URLs already registered keep their ID, so a replayed or
   * retried step gets the same IDs back.
   */
  appendSources(sessionId: string, sources: NewSource[]): Promise<SessionSource[]>;
  getSources(sessionId: string): Promise<SessionSource[]>;
  /** web_search tool calls panelists made in persisted turns, for the per-session cap. */
  countToolSearches(sessionId: string): Promise<number>;
  /** Seat a different model for one panelist (used when a free model stops answering). */
  setSeatModel(sessionId: string, personaId: string, modelId: string): Promise<void>;
  /** The OpenRouter catalog annotated with Parloir's model health. */
  loadCatalog(): Promise<CatalogModel[]>;
}

export interface DebateDeps {
  ctx: ProviderContext;
  storage: Storage;
  sink: StreamSink;
  controlPlane: ControlPlane;
  durable: Durable;
}

// ─── Top-level: run the full debate ─────────────────────────────────────────

export async function runDebate(
  session: Session,
  participants: Participant[],
  deps: DebateDeps,
): Promise<{ status: "completed" | "failed" }> {
  const { ctx, storage, sink, durable } = deps;
  const roster = new Roster(participants);

  const enterPhase = (phase: Phase, round: number, status: Phase = phase) =>
    durable.step(`phase:${phase}:${round}:enter`, async () => {
      await storage.updateSession(session.id, { status, currentRound: round });
      await sink.emit({ type: "phase_enter", phase, round });
    });
  const exitPhase = (phase: Phase, round: number) =>
    durable.step(`phase:${phase}:${round}:exit`, async () => {
      await sink.emit({ type: "phase_exit", phase, round, reason: "normal" });
    });

  try {
    // Phase 0: shared web research, when the question needs it. Never fails
    // the debate: without it the panel argues from its own knowledge.
    const research = await runResearchPhase(session, participants, deps);

    // Phase 1: parallel blind opening. Injections are drained AFTER it — agents start blind.
    session.currentRound = 0;
    await enterPhase("opening", 0);
    const openingSpeakers = roster.active();
    const openingTurn = (personaId: string, idx: number) => () =>
      runAgentTurn({
        session,
        personaId,
        ctx,
        phase: "opening",
        roundNumber: 0,
        turnIndex: idx,
        storage,
        sink,
        research,
      });
    let openingOutcomes = await Promise.all(
      openingSpeakers.map((p, idx) => durable.step(`turn:opening:0:${p.personaId}`, openingTurn(p.personaId, idx))),
    );
    // Failed openings are redone once all openings are in, still blind: they
    // read the question, not the others' answers. Free seats first get
    // another free model on their own; whatever still fails pauses for a fix.
    assertCanContinue(openingOutcomes, roster, false);
    const openingIndex = (personaId: string) => openingSpeakers.findIndex((p) => p.personaId === personaId);
    const triedModels = new Map<string, Set<string>>();
    for (let swap = 1; swap <= MAX_FREE_SWAPS; swap++) {
      const failed = openingOutcomes.filter(swappable);
      if (failed.length === 0) break;
      const swaps = await swapFailedFreeSeats(session, failed, `opening:${swap}`, deps, triedModels);
      if (swaps.length === 0) break;
      const redone = await Promise.all(
        swaps.map((s) =>
          durable.step(`turn:opening:0:${s.personaId}:swap:${swap}`, openingTurn(s.personaId, openingIndex(s.personaId))),
        ),
      );
      openingOutcomes = openingOutcomes.map((o) => redone.find((r) => r.personaId === o.personaId) ?? o);
      assertCanContinue(redone, roster, false);
    }
    for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
      const failed = openingOutcomes.filter(canFix);
      if (failed.length === 0) break;
      await pauseForModelFix(session, failed, `opening:${attempt}`, "opening", deps, roster);
      const redone = await Promise.all(
        failed
          .filter((f) => !roster.isDropped(f.personaId))
          .map((f) =>
            durable.step(
              `turn:opening:0:${f.personaId}:retry:${attempt}`,
              openingTurn(f.personaId, openingIndex(f.personaId)),
            ),
          ),
      );
      openingOutcomes = openingOutcomes.map((o) => redone.find((r) => r.personaId === o.personaId) ?? o);
      assertCanContinue(redone, roster, false);
    }
    openingOutcomes.forEach((o) => roster.record(o));
    assertCanContinue(openingOutcomes, roster, true);
    await exitPhase("opening", 0);
    await phaseBoundary(session, "after-opening", "opening", deps, roster);

    // Phase 2..N: critique rounds with consensus checks.
    let consensusReached = false;
    for (let round = 1; round <= session.protocol.maxCritiqueRounds && !consensusReached; round++) {
      session.currentRound = round;
      await enterPhase("critique", round);
      await runRound(session, "critique", round, roster.active(), roster, deps, research);
      await exitPhase("critique", round);
      await phaseBoundary(session, `after-critique-${round}`, "critique", deps, roster);

      const report = await runConsensusCheck(session, participants, round, deps);

      // Honor the judge's explicit "stop" even below threshold — this is how
      // the fallback report signals "don't burn another round".
      if (
        report.recommendation === "proceed_to_synthesis" ||
        report.consensusLevel >= session.protocol.consensusThreshold
      ) {
        consensusReached = true;
      } else if (
        report.recommendation === "another_round" &&
        session.protocol.enableAdaptiveRound &&
        round === session.protocol.maxCritiqueRounds
      ) {
        const adaptiveRound = round + 1;
        session.currentRound = adaptiveRound;
        await enterPhase("adaptive_round", adaptiveRound);
        await phaseBoundary(session, "before-adaptive", "adaptive_round", deps, roster);
        await runAdaptiveRound(session, adaptiveRound, report, roster, deps, research);
        await exitPhase("adaptive_round", adaptiveRound);
        break;
      }
    }

    // Phase 5: synthesis.
    await phaseBoundary(session, "before-synthesis", "synthesis", deps, roster);
    await enterPhase("synthesis", session.currentRound);
    await runSynthesis(session, participants, deps);
    await durable.step("finish", async () => {
      await sink.emit({ type: "phase_exit", phase: "synthesis", round: session.currentRound, reason: "normal" });
      await storage.updateSession(session.id, { status: "completed", completedAt: new Date() });
    });
    return { status: "completed" };
  } catch (err) {
    const message =
      err instanceof DebateAbortedError
        ? err.message
        : "The debate stopped because of an unexpected error. Your transcript so far is saved.";
    const code = err instanceof DebateAbortedError ? err.code : describeModelError(err).code;
    console.error("[debate] failed", { sessionId: session.id, err });
    await durable.step("fail", async () => {
      await storage.updateSession(session.id, { status: "failed" });
      await sink.emit({ type: "error", message, code, recoverable: false });
    });
    return { status: "failed" };
  }
}

// ─── Critique and adaptive rounds ───────────────────────────────────────────
/**
 * Sequential round-robin. Each agent sees all prior turns. Each turn MUST
 * refine, critique a named participant, or concede (novelty requirement —
 * prevents sycophantic agreement spirals).
 */
async function runRound(
  session: Session,
  phase: "critique" | "adaptive_round",
  round: number,
  speakers: Participant[],
  roster: Roster,
  deps: DebateDeps,
  research: ResearchOutcome,
): Promise<void> {
  for (let i = 0; i < speakers.length; i++) {
    // Between-turn control point: honor a pause requested while the previous
    // speaker was streaming instead of waiting for the whole round to finish.
    if (i > 0) await phaseBoundary(session, `${phase}-${round}-turn-${i}`, phase, deps, roster);

    const p = speakers[i];
    if (roster.isDropped(p.personaId)) continue;
    const outcome = await turnWithFix({
      session,
      personaId: p.personaId,
      stepId: `turn:${phase}:${round}:${i}:${p.personaId}`,
      atPhase: phase,
      run: () =>
        runAgentTurn({
          session,
          personaId: p.personaId,
          ctx: deps.ctx,
          phase,
          roundNumber: round,
          storage: deps.storage,
          sink: deps.sink,
          research,
        }),
      deps,
      roster,
    });
    roster.record(outcome);
    assertCanContinue([outcome], roster, false);
  }
}

/**
 * Rank-Adaptive Cross-Round: the judge ranks participants by argument quality,
 * silences the weakest one, and reorders speakers so the strongest goes last.
 */
async function runAdaptiveRound(
  session: Session,
  round: number,
  report: ConsensusReport,
  roster: Roster,
  deps: DebateDeps,
  research: ResearchOutcome,
): Promise<void> {
  await deps.durable.step(`adaptive:${round}:silence`, () =>
    deps.storage.setParticipantSilenced(session.id, report.silencedForNextRound, true),
  );

  const rank = new Map(report.participantRanking.map((r) => [r.personaId, r.score]));
  const speakers = roster
    .active(report.silencedForNextRound)
    .sort((a, b) => (rank.get(a.personaId) ?? 0) - (rank.get(b.personaId) ?? 0));

  await runRound(session, "adaptive_round", round, speakers, roster, deps, research);
}

// ─── Consensus check (judge) ────────────────────────────────────────────────

async function runConsensusCheck(
  session: Session,
  participants: Participant[],
  round: number,
  deps: DebateDeps,
): Promise<ConsensusReport> {
  const { ctx, storage, sink, durable } = deps;
  return durable.step(`consensus:${round}`, async () => {
    await storage.updateSession(session.id, { status: "consensus_check", currentRound: round });
    await sink.emit({ type: "phase_enter", phase: "consensus_check", round });

    const judgeModelChain = pickJudgeModelChain(
      session.protocol.judgeModel,
      ctx,
      await panelModelIds(session, participants),
    );
    const transcript = await storage.getTranscript(session.id);
    const report = await evaluateConsensus({
      question: session.question,
      transcript,
      evidence: await loadEvidence(transcript, session.id, storage),
      participants,
      judgeModelChain,
      ctx,
    });

    await storage.appendConsensusReport(session.id, round, report);
    await sink.emit({ type: "consensus_report", report });
    await sink.emit({ type: "phase_exit", phase: "consensus_check", round, reason: "normal" });
    return report;
  });
}

// ─── Synthesis (secretary) ──────────────────────────────────────────────────

async function runSynthesis(session: Session, participants: Participant[], deps: DebateDeps) {
  const { ctx, storage, sink, durable } = deps;
  // Model failures come back as a value, not an exception: a thrown error
  // would make Inngest retry the (slow, paid) synthesis step.
  const outcome = await durable.step("synthesis", async () => {
    const synthesizerModelChain = pickSynthesizerModelChain(
      session.protocol.synthesizerModel,
      ctx,
      await panelModelIds(session, participants),
    );
    try {
      const transcript = await storage.getTranscript(session.id);
      const artifact = await synthesize({
        session,
        transcript,
        brief: transcript.find((t) => t.phase === "research")?.content ?? null,
        sources: await storage.getSources(session.id),
        synthesizerModelChain,
        ctx,
        sink,
      });
      await storage.appendArtifact(artifact);
      await sink.emit({ type: "synthesis_complete", artifact });
      return { ok: true as const };
    } catch (err) {
      console.warn("[synthesis] failed", { sessionId: session.id, err });
      return { ok: false as const };
    }
  });
  if (!outcome.ok) {
    throw new DebateAbortedError(
      "None of the panel's models could write the final summary. The transcript is saved; try again with a stronger model.",
      "synthesis_failed",
    );
  }
}
