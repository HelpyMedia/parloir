/**
 * Who is still able to speak in a debate. Derived only from memoized step
 * results and seats re-read inside steps, so it is identical on every replay.
 */
import { DebateAbortedError, isAccountWideError } from "./model-errors";
import type { TurnOutcome } from "./turn";
import type { Participant } from "./types";

/** A participant that fails this many turns in a row is dropped from the debate. */
const MAX_CONSECUTIVE_FAILURES = 2;

export class Roster {
  private failures = new Map<string, number>();
  private dropped = new Set<string>();
  private spoke = new Set<string>();

  constructor(private readonly participants: Participant[]) {
    for (const p of participants) if (p.removed) this.dropped.add(p.personaId);
  }

  /** Taken off the panel by the person (or left unfixed past the pause limit). */
  remove(personaId: string) {
    this.dropped.add(personaId);
  }

  record(outcome: TurnOutcome) {
    if (outcome.ok) {
      this.failures.set(outcome.personaId, 0);
      this.spoke.add(outcome.personaId);
      return;
    }
    const n = (this.failures.get(outcome.personaId) ?? 0) + 1;
    this.failures.set(outcome.personaId, n);
    // A refused model will never answer, so its seat goes now instead of
    // spending another call; other failures may be transient.
    if (n >= MAX_CONSECUTIVE_FAILURES || outcome.code === "model_restricted") {
      this.dropped.add(outcome.personaId);
    }
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

export function assertCanContinue(outcomes: TurnOutcome[], roster: Roster, afterOpening: boolean) {
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

