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

type WorkflowStep = GetFunctionInput<typeof inngest>["step"];

const RESUME_TIMEOUT = "7d"; // generous — Inngest stores state for us.

export function createInngestControlPlane(
  step: WorkflowStep,
  sessionId: string,
): ControlPlane {
  return {
    async drainInjections(sid: string): Promise<HumanInjection[]> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      return drainPendingInjections(sid);
    },

    async isPauseRequested(sid: string): Promise<boolean> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      return isSessionPauseRequested(sid);
    },

    async markPausedAtPhase(sid: string, phase: Phase): Promise<void> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      await markSessionPausedAtPhase(sid, phase);
    },

    async waitIfPauseRequested(sid: string): Promise<boolean> {
      if (sid !== sessionId) throw new Error("ControlPlane/session mismatch");
      if (!(await isSessionPauseRequested(sid))) return false;

      // Suspend until POST /resume sends { name: "debate.resumed", data: { sessionId } }.
      await step.waitForEvent(`await-resume:${sid}`, {
        event: "debate.resumed",
        match: "data.sessionId",
        timeout: RESUME_TIMEOUT,
      });

      await clearSessionPause(sid);
      return true;
    },
  };
}
