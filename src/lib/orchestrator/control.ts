/**
 * ControlPlane — the human-in-the-loop interface the orchestrator depends on.
 *
 * The orchestrator calls into this at every phase boundary:
 *   1. drainInjections(sessionId) — returns any queued human notes.
 *   2. waitIfPauseRequested(sessionId) — blocks until resumed, durably.
 *
 * Two implementations:
 *   - InngestControlPlane: uses step.waitForEvent("debate.resumed"); durable
 *     across restarts. Lives in src/lib/inngest/control-plane.ts.
 *   - NoopControlPlane: for unit tests and scripts that run runDebate inline.
 *     waitIfPauseRequested is a no-op; drainInjections returns []. Pause has
 *     no effect in this mode.
 */

import type { HumanInjection, Phase } from "./types";

export interface ControlPlane {
  /** Drain queued human notes, marking them delivered. Safe to call often. */
  drainInjections(sessionId: string): Promise<HumanInjection[]>;

  /**
   * If the session has a pending pause request, block until a matching
   * "debate.resumed" signal arrives or the timeout expires, then clear the
   * pause flag. Returns true if the call actually paused, false otherwise.
   */
  waitIfPauseRequested(sessionId: string): Promise<boolean>;

  /**
   * Best-effort snapshot of the pause flag for the given session. Used by the
   * orchestrator to emit `human_injection_request` before calling
   * waitIfPauseRequested so the UI can render the overlay immediately.
   */
  isPauseRequested(sessionId: string): Promise<boolean>;

  /** Record which phase we're pausing in, so resume can restore it. */
  markPausedAtPhase(sessionId: string, phase: Phase): Promise<void>;
}

export class NoopControlPlane implements ControlPlane {
  async drainInjections(): Promise<HumanInjection[]> {
    return [];
  }
  async waitIfPauseRequested(): Promise<boolean> {
    return false;
  }
  async isPauseRequested(): Promise<boolean> {
    return false;
  }
  async markPausedAtPhase(): Promise<void> {
    /* no-op */
  }
}
