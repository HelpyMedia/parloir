/**
 * Inngest-backed ControlPlane.
 *
 * Built per-invocation because step.waitForEvent must be called with the
 * current workflow's `step` instance. The factory below closes over `step`
 * and the `sessionId` we are running for.
 *
 * Durability: step.waitForEvent is Inngest's native "suspend until signal"
 * primitive — the function state is persisted, the in-process runtime frees
 * its resources, and resumption happens when a matching event arrives.
 */

import type { GetFunctionInput } from "inngest";
import type { inngest } from "./client";
import type { ControlPlane } from "@/lib/orchestrator/control";
import type { HumanInjection, Phase } from "@/lib/orchestrator/types";
import {
  drainPendingInjections,
  isSessionPauseRequested,
  markSessionPausedAtPhase,
  clearSessionPause,
} from "@/lib/db/client";

export type WorkflowStep = GetFunctionInput<typeof inngest>["step"];

export function createInngestControlPlane(
  step: WorkflowStep,
  sessionId: string,
): ControlPlane {
  const check = (sid: string) => {
    if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
  };

  return {
    async drainInjections(sid: string): Promise<HumanInjection[]> {
      check(sid);
      return drainPendingInjections(sid);
    },

    async isPauseRequested(sid: string): Promise<boolean> {
      check(sid);
      return isSessionPauseRequested(sid);
    },

    async markPausedAtPhase(sid: string, phase: Phase): Promise<void> {
      check(sid);
      await markSessionPausedAtPhase(sid, phase);
    },

    async clearPause(sid: string): Promise<void> {
      check(sid);
      await clearSessionPause(sid);
    },

    async waitForResume(sid: string, waitKey: string, timeout: string): Promise<boolean> {
      check(sid);
      // Resolves to the event, or null on timeout.
      const evt = await step.waitForEvent(`await-resume:${waitKey}`, {
        event: "debate.resumed",
        match: "data.sessionId",
        timeout,
      });
      return evt !== null;
    },
  };
}
