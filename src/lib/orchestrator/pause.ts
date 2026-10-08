/**
 * Durable pauses: the person's Pause button (at phase boundaries and between
 * critique turns) and the shared wait used when a model fails (model-fix.ts).
 *
 * Every pause decision and every seat reload happens inside a step, so a
 * replay can never take a different branch than the original run did.
 */
import type { DebateDeps } from "./protocol";
import type { Roster } from "./roster";
import type { Phase, Seats, Session, Turn } from "./types";

/** One short wait first (covers a resume racing the wait), then long waits. */
const FIRST_RESUME_WAIT = "2m";
const LATER_RESUME_WAIT = "15m";
const MAX_RESUME_WAITS = 96; // ≈ 24h

/**
 * Suspend until the pause flag is cleared. Returns false if nobody resumed
 * within ~24h. The resume route clears the flag before signalling, so the
 * flag is the source of truth; the event only wakes us up early.
 */
export async function waitWhilePaused(
  session: Session,
  waitKey: string,
  stepPrefix: string,
  deps: DebateDeps,
): Promise<boolean> {
  const { controlPlane, durable } = deps;
  // IDs keep the format debates paused before this module existed recorded,
  // so they replay onto their memoized steps.
  for (let i = 0; i < MAX_RESUME_WAITS; i++) {
    await controlPlane.waitForResume(session.id, `${waitKey}:${i}`, i === 0 ? FIRST_RESUME_WAIT : LATER_RESUME_WAIT);
    const stillPaused = await durable.step(`${stepPrefix}:check:${i}`, () => controlPlane.isPauseRequested(session.id));
    if (!stillPaused) return true;
  }
  return false;
}

/**
 * Apply seats re-read after a pause: models the person switched take effect
 * for every later turn, and removed panelists never speak again.
 */
export function applySeats(session: Session, roster: Roster, seats: Seats | null | undefined): void {
  // A run recorded before seat reloads existed memoized nothing here.
  if (!seats) return;
  session.participantModelOverrides = { ...seats.overrides };
  for (const personaId of seats.removed) roster.remove(personaId);
}

/**
 * Called between phases and between critique turns. Appends any queued human
 * notes as human turns, then suspends durably if a pause was requested.
 *
 * The pause decision is memoized inside a step so a replay can never take a
 * different branch than the original run did.
 */
export async function phaseBoundary(
  session: Session,
  key: string,
  atPhase: Phase,
  deps: DebateDeps,
  roster: Roster,
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

  await waitWhilePaused(session, key, `boundary:${key}`, deps);

  // Models may have been switched or panelists removed during the pause.
  const seats = await durable.step(`boundary:${key}:resume`, async () => {
    await controlPlane.clearPause(session.id);
    await storage.updateSession(session.id, { status: atPhase });
    await sink.emit({ type: "phase_enter", phase: atPhase, round: session.currentRound });
    await drainOnce(session, atPhase, deps);
    return storage.loadSeats(session.id);
  });
  applySeats(session, roster, seats);
}

export async function drainOnce(session: Session, atPhase: Phase, deps: DebateDeps): Promise<void> {
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
