/**
 * Picks a judge or synthesizer model ID at runtime based on which providers
 * the user has actually connected. Called from the orchestrator immediately
 * before invoking consensus/synthesis, so resolution always reflects the
 * current ProviderContext — never the stale default baked into the session.
 *
 * Strategy: honor the desired model if its provider is available; otherwise
 * walk a preference chain of known cheap/strong cloud models; as a final
 * guaranteed fallback, reuse the first persona's own model (which resolved
 * successfully to start the debate, so it's known-good).
 */

import { availableProviders } from "./registry";
import type { ProviderContext } from "@/lib/orchestrator/types";

const JUDGE_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: "anthropic", modelId: "anthropic/claude-haiku-4-5" },
  { provider: "google", modelId: "google/gemini-2.5-flash" },
  { provider: "openai", modelId: "openai/gpt-4o-mini" },
  { provider: "openrouter", modelId: "openrouter/anthropic/claude-haiku-4.5" },
];

const SYNTH_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: "anthropic", modelId: "anthropic/claude-opus-4-7" },
  { provider: "openai", modelId: "openai/gpt-4o" },
  { provider: "google", modelId: "google/gemini-2.5-pro" },
  { provider: "openrouter", modelId: "openrouter/anthropic/claude-opus-4.7" },
];

const CLASSIFIER_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: "anthropic", modelId: "anthropic/claude-haiku-4-5" },
  { provider: "google", modelId: "google/gemini-2.5-flash" },
  { provider: "openai", modelId: "openai/gpt-4o-mini" },
  { provider: "openrouter", modelId: "openrouter/anthropic/claude-haiku-4.5" },
];

function providerOf(modelId: string): string {
  const first = modelId.split("/")[0];
  return first === "google-gemini" ? "google" : first;
}

function buildChain(
  desired: string,
  preferences: Array<{ provider: string; modelId: string }>,
  ctx: ProviderContext,
  personaModels: string[],
): string[] {
  const available = new Set(availableProviders(ctx));
  const out: string[] = [];
  const add = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };

  if (available.has(providerOf(desired))) add(desired);
  for (const p of preferences) {
    if (available.has(p.provider)) add(p.modelId);
  }
  for (const m of personaModels) add(m);

  return out;
}

export function pickJudgeModelChain(
  desired: string,
  ctx: ProviderContext,
  personaModels: string[],
): string[] {
  return buildChain(desired, JUDGE_PREFERENCES, ctx, personaModels);
}

export function pickSynthesizerModelChain(
  desired: string,
  ctx: ProviderContext,
  personaModels: string[],
): string[] {
  return buildChain(desired, SYNTH_PREFERENCES, ctx, personaModels);
}

export function pickJudgeModel(
  desired: string,
  ctx: ProviderContext,
  personaModels: string[],
): string {
  const chain = pickJudgeModelChain(desired, ctx, personaModels);
  return chain[0] ?? desired;
}

export function pickSynthesizerModel(
  desired: string,
  ctx: ProviderContext,
  personaModels: string[],
): string {
  const chain = pickSynthesizerModelChain(desired, ctx, personaModels);
  return chain[0] ?? desired;
}

/**
 * Classifier chain for the panel recommender. Unlike the judge/synth chains,
 * we do NOT append persona default models. At recommender time nothing has
 * started, and every template persona currently defaults to an Anthropic
 * model, so that tail would just add latency for users without Anthropic.
 * Callers should treat an empty return as "no classifier available" and
 * short-circuit (e.g. respond 204).
 */
export function pickClassifierModelChain(ctx: ProviderContext): string[] {
  const available = new Set(availableProviders(ctx));
  const out: string[] = [];
  for (const p of CLASSIFIER_PREFERENCES) {
    if (available.has(p.provider)) out.push(p.modelId);
  }
  return out;
}
