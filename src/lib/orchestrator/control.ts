/**
 * ControlPlane — the human-in-the-loop interface the orchestrator depends on.
 *
 * The orchestrator calls into this at every phase boundary (see
 * `phaseBoundary` in protocol.ts). Everything except `waitForResume` is
 * called from INSIDE a durable step; `waitForResume` is called between steps
 * because Inngest's `step.waitForEvent` cannot be nested in `step.run`.
 *
 * Two implementations:
 *   - InngestControlPlane: `waitForResume` uses step.waitForEvent; durable
 *     across restarts. Lives in src/lib/inngest/control-plane.ts.
 *   - NoopControlPlane: for unit tests and scripts that run runDebate inline.
 *     Pause has no effect in this mode.
 */

import type { HumanInjection, Phase } from "./types";

export interface ControlPlane {
  /** Drain queued human notes, marking them delivered. Safe to call often. */
  drainInjections(sessionId: string): Promise<HumanInjection[]>;

  /** Snapshot of the pause flag. */
  isPauseRequested(sessionId: string): Promise<boolean>;

  /** Record which phase we're pausing in, so resume can restore it. */
  markPausedAtPhase(sessionId: string, phase: Phase): Promise<void>;

  /** Clear the pause flag and paused-at phase. */
  clearPause(sessionId: string): Promise<void>;

  /**
   * Suspend until a resume signal arrives or `timeout` elapses. `waitKey`
   * must be unique per call within one run (it becomes the step ID).
   * Returns true when a signal arrived, false on timeout.
   */
  waitForResume(sessionId: string, waitKey: string, timeout: string): Promise<boolean>;
}

export class NoopControlPlane implements ControlPlane {
  async drainInjections(): Promise<HumanInjection[]> {
    return [];
  }
  async isPauseRequested(): Promise<boolean> {
    return false;
  }
  async markPausedAtPhase(): Promise<void> {
    /* no-op */
  }
  async clearPause(): Promise<void> {
    /* no-op */
  }
  async waitForResume(): Promise<boolean> {
    return true;
  }
}
