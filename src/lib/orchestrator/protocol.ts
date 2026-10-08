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
import { loadPersona } from "../personas";
import { evaluateConsensus } from "./consensus";
import { synthesize } from "./synthesis";
import { participantModelId, runAgentTurn, type TurnOutcome } from "./turn";
import { DebateAbortedError, describeModelError, isAccountWideError, type ModelErrorCode } from "./model-errors";
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
  setParticipantSilenced(sessionId: string, personaIds: string[], silenced: boolean): Promise<void>;
  appendConsensusReport(sessionId: string, afterRound: number, report: ConsensusReport): Promise<void>;
  appendArtifact(artifact: SynthesisArtifact): Promise<void>;
  /** Best-effort record of how a model did on one turn (null code = answered). Never throws. */
  recordModelOutcome(modelId: string, code: ModelErrorCode | null): Promise<void>;
}

export interface DebateDeps {
  ctx: ProviderContext;
  storage: Storage;
  sink: StreamSink;
  controlPlane: ControlPlane;
  durable: Durable;
}

/** A participant that fails this many turns in a row is dropped from the debate. */
const MAX_CONSECUTIVE_FAILURES = 2;

/** Pause handling: one short wait first (covers a resume racing the wait), then long waits. */
const FIRST_RESUME_WAIT = "2m";
const LATER_RESUME_WAIT = "15m";
const MAX_RESUME_WAITS = 96; // ≈ 24h, then the debate resumes on its own.

/**
 * Tracks who is still able to speak. Derived only from memoized step
 * results, so it is identical on every replay.
 */
class Roster {
  private failures = new Map<string, number>();
  private dropped = new Set<string>();
  private spoke = new Set<string>();

  constructor(private readonly participants: Participant[]) {}

  record(outcome: TurnOutcome) {
    if (outcome.ok) {
      this.failures.set(outcome.personaId, 0);
      this.spoke.add(outcome.personaId);
      return;
    }
    const n = (this.failures.get(outcome.personaId) ?? 0) + 1;
    this.failures.set(outcome.personaId, n);
    if (n >= MAX_CONSECUTIVE_FAILURES) this.dropped.add(outcome.personaId);
  }

  /** Participants still in the debate, in seat order. */
  active(exclude: string[] = []): Participant[] {
    return this.participants
      .filter((p) => !p.silenced && !this.dropped.has(p.personaId) && !exclude.includes(p.personaId))
      .sort((a, b) => a.seatIndex - b.seatIndex);
  }

  spokenCount() {
    return this.spoke.size;
  }

  isDropped(personaId: string) {
    return this.dropped.has(personaId);
  }
}

function assertCanContinue(outcomes: TurnOutcome[], roster: Roster, afterOpening: boolean) {
  const accountWide = outcomes.find((o) => !o.ok && isAccountWideError(o.code));
  if (accountWide && !accountWide.ok) {
    throw new DebateAbortedError(accountWide.message, accountWide.code);
  }
  if (afterOpening && roster.spokenCount() < 2) {
    // Individual reasons were already streamed as turn_failed notices.
    throw new DebateAbortedError(
      "Fewer than two panelists could answer, so there was nothing to debate. Try again with other models.",
      "not_enough_participants",
    );
  }
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
    // Phase 1: parallel blind opening. Injections are drained AFTER it — agents start blind.
    session.currentRound = 0;
    await enterPhase("opening", 0);
    const openingSpeakers = roster.active();
    const openingOutcomes = await Promise.all(
      openingSpeakers.map((p, idx) =>
        durable.step(`turn:opening:0:${p.personaId}`, () =>
          runAgentTurn({
            session,
            personaId: p.personaId,
            ctx,
            phase: "opening",
            roundNumber: 0,
            turnIndex: idx,
            storage,
            sink,
          }),
        ),
      ),
    );
    openingOutcomes.forEach((o) => roster.record(o));
    assertCanContinue(openingOutcomes, roster, true);
    await exitPhase("opening", 0);
    await phaseBoundary(session, "after-opening", "opening", deps);

    // Phase 2..N: critique rounds with consensus checks.
    let consensusReached = false;
    for (let round = 1; round <= session.protocol.maxCritiqueRounds && !consensusReached; round++) {
      session.currentRound = round;
      await enterPhase("critique", round);
      await runRound(session, "critique", round, roster.active(), roster, deps);
      await exitPhase("critique", round);
      await phaseBoundary(session, `after-critique-${round}`, "critique", deps);

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
        await phaseBoundary(session, "before-adaptive", "adaptive_round", deps);
        await runAdaptiveRound(session, adaptiveRound, report, roster, deps);
        await exitPhase("adaptive_round", adaptiveRound);
        break;
      }
    }

    // Phase 5: synthesis.
    await phaseBoundary(session, "before-synthesis", "synthesis", deps);
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
): Promise<void> {
  for (let i = 0; i < speakers.length; i++) {
    // Between-turn control point: honor a pause requested while the previous
    // speaker was streaming instead of waiting for the whole round to finish.
    if (i > 0) await phaseBoundary(session, `${phase}-${round}-turn-${i}`, phase, deps);

    const p = speakers[i];
    if (roster.isDropped(p.personaId)) continue;
    const outcome = await deps.durable.step(`turn:${phase}:${round}:${i}:${p.personaId}`, () =>
      runAgentTurn({
        session,
        personaId: p.personaId,
        ctx: deps.ctx,
        phase,
        roundNumber: round,
        storage: deps.storage,
        sink: deps.sink,
      }),
    );
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
): Promise<void> {
  await deps.durable.step(`adaptive:${round}:silence`, () =>
    deps.storage.setParticipantSilenced(session.id, report.silencedForNextRound, true),
  );

  const rank = new Map(report.participantRanking.map((r) => [r.personaId, r.score]));
  const speakers = roster
    .active(report.silencedForNextRound)
    .sort((a, b) => (rank.get(a.personaId) ?? 0) - (rank.get(b.personaId) ?? 0));

  await runRound(session, "adaptive_round", round, speakers, roster, deps);
}

// ─── Consensus check (judge) ────────────────────────────────────────────────

async function panelModels(session: Session, participants: Participant[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of participants) {
    out.push(participantModelId(session, await loadPersona(p.personaId)));
  }
  return out;
}

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
      await panelModels(session, participants),
    );
    const report = await evaluateConsensus({
      question: session.question,
      transcript: await storage.getTranscript(session.id),
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
      await panelModels(session, participants),
    );
    try {
      const artifact = await synthesize({
        session,
        transcript: await storage.getTranscript(session.id),
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

// ─── Phase-boundary control point ───────────────────────────────────────────
/**
 * Called between phases and between critique turns. Appends any queued human
 * notes as human turns, then suspends durably if a pause was requested.
 *
 * The pause decision is memoized inside a step so a replay can never take a
 * different branch than the original run did.
 */
async function phaseBoundary(
  session: Session,
  key: string,
  atPhase: Phase,
  deps: DebateDeps,
): Promise<void> {
  const { storage, sink, controlPlane, durable } = deps;

  const paused = await durable.step(`boundary:${key}`, async () => {
    await drainOnce(session, atPhase, deps);
    if (!(await controlPlane.isPauseRequested(session.id))) return false;
    await controlPlane.markPausedAtPhase(session.id, atPhase);
    await storage.updateSession(session.id, { status: "paused" });
    await sink.emit({
      type: "human_injection_request",
      prompt: "Deliberation paused. Add a note to steer the next phase, or resume without interjecting.",
    });
    return true;
  });
  if (!paused) return;

  // The resume route clears the pause flag before signalling, so the flag is
  // the source of truth; the event only wakes us up early.
  for (let i = 0; i < MAX_RESUME_WAITS; i++) {
    await controlPlane.waitForResume(
      session.id,
      `${key}:${i}`,
      i === 0 ? FIRST_RESUME_WAIT : LATER_RESUME_WAIT,
    );
    const stillPaused = await durable.step(`boundary:${key}:check:${i}`, () =>
      controlPlane.isPauseRequested(session.id),
    );
    if (!stillPaused) break;
  }

  await durable.step(`boundary:${key}:resume`, async () => {
    await controlPlane.clearPause(session.id);
    await storage.updateSession(session.id, { status: atPhase });
    await sink.emit({ type: "phase_enter", phase: atPhase, round: session.currentRound });
    await drainOnce(session, atPhase, deps);
  });
}

async function drainOnce(session: Session, atPhase: Phase, deps: DebateDeps): Promise<void> {
  const { storage, sink, controlPlane } = deps;
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
