/**
 * When a panelist's model fails, pause so the person can switch its model or
 * take the panelist off the panel, then redo the same turn. Carrying on a
 * panelist short wastes the round they missed (and the money spent on it).
 *
 * A bad key fails every model alike, so it still aborts the debate instead.
 * Each turn gets a few tries; if nobody comes back within the pause limit,
 * the panelist is dropped and the debate carries on without them.
 */
import { loadPersona } from "../personas";
import { isAccountWideError } from "./model-errors";
import { applySeats, drainOnce, waitWhilePaused } from "./pause";
import { participantModelId, type TurnOutcome } from "./turn";
import type { DebateDeps } from "./protocol";
import type { Roster } from "./roster";
import type { ModelFixSeat, Phase, Session } from "./types";

/** Pauses per turn before the panelist is dropped. */
export const MAX_FIX_ATTEMPTS = 3;

type FailedOutcome = Extract<TurnOutcome, { ok: false }>;

/** A failure the person can fix by switching models. */
export function canFix(o: TurnOutcome): o is FailedOutcome {
  return !o.ok && !isAccountWideError(o.code);
}

/**
 * Pause for the person to fix failed seats, then re-read the panel. Seats
 * left unfixed past the pause limit are dropped.
 */
export async function pauseForModelFix(
  session: Session,
  failed: FailedOutcome[],
  key: string,
  atPhase: Phase,
  deps: DebateDeps,
  roster: Roster,
): Promise<void> {
  const { storage, sink, controlPlane, durable } = deps;
  const stepKey = `modelfix:${key}`;

  await durable.step(stepKey, async () => {
    const seats: ModelFixSeat[] = [];
    for (const f of failed) {
      const persona = await loadPersona(f.personaId);
      seats.push({
        personaId: f.personaId,
        personaName: persona.name,
        modelId: participantModelId(session, persona),
        code: f.code,
      });
    }
    await storage.updateSession(session.id, { status: "paused", pauseRequestedAt: new Date() });
    await controlPlane.markPausedAtPhase(session.id, atPhase);
    await sink.emit({ type: "model_fix_request", phase: atPhase, seats });
  });

  const resumed = await waitWhilePaused(session, stepKey, stepKey, deps);

  const seats = await durable.step(`${stepKey}:resume`, async () => {
    await controlPlane.clearPause(session.id);
    await storage.updateSession(session.id, { status: atPhase });
    await sink.emit({ type: "phase_enter", phase: atPhase, round: session.currentRound });
    await drainOnce(session, atPhase, deps);
    return storage.loadSeats(session.id);
  });
  applySeats(session, roster, seats);
  if (!resumed) for (const f of failed) roster.remove(f.personaId);
}

/**
 * Run one turn; on a fixable failure, pause for a fix and redo it in the same
 * slot with whatever model the seat has now.
 */
export async function turnWithFix(params: {
  session: Session;
  personaId: string;
  stepId: string;
  atPhase: Phase;
  run: () => Promise<TurnOutcome>;
  deps: DebateDeps;
  roster: Roster;
}): Promise<TurnOutcome> {
  const { session, personaId, stepId, atPhase, run, deps, roster } = params;
  let outcome = await deps.durable.step(stepId, run);
  for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS && canFix(outcome); attempt++) {
    await pauseForModelFix(session, [outcome], `${stepId}:${attempt}`, atPhase, deps, roster);
    if (roster.isDropped(personaId)) break;
    outcome = await deps.durable.step(`${stepId}:retry:${attempt}`, run);
  }
  return outcome;
}
