/**
 * Runtime model chains for the judge and the secretary.
 *
 * No model ID is pinned here. The session stores an explicit judge and
 * secretary (picked from the live OpenRouter catalog when the session is
 * created, see src/lib/sessions/model-picks.ts). At run time we try that
 * model first and fall back to the panel's own models — those already
 * answered during the debate, so they are known to work with the user's
 * credentials.
 */

import { availableProviders } from "./registry";
import type { ProviderContext } from "../orchestrator/types";

function providerOf(modelId: string): string {
  const first = modelId.split("/")[0];
  return first === "google-gemini" ? "google" : first;
}

function buildChain(desired: string, ctx: ProviderContext, panelModels: string[]): string[] {
  const available = new Set(availableProviders(ctx));
  const out: string[] = [];
  const add = (id: string) => {
    if (id && !out.includes(id)) out.push(id);
  };

  if (desired && available.has(providerOf(desired))) add(desired);
  for (const m of panelModels) add(m);
  return out;
}

export function pickJudgeModelChain(
  desired: string,
  ctx: ProviderContext,
  panelModels: string[],
): string[] {
  return buildChain(desired, ctx, panelModels);
}

export function pickSynthesizerModelChain(
  desired: string,
  ctx: ProviderContext,
  panelModels: string[],
): string[] {
  return buildChain(desired, ctx, panelModels);
}
