/**
 * Returns the model ID the picker will preserve on mount for this user.
 *
 * Mirrors `resolveModel`'s provider precedence (src/lib/providers/registry.ts),
 * but operates on strings so callers (the panel recommender) can validate
 * candidates before ever constructing a LanguageModel. The picker
 * (ModelPickerInline.tsx:19,69) derives the active provider tab from the
 * literal prefix of the modelId and snaps the value if the prefix does not
 * match; so a server-approved `anthropic/...` override for a user with only
 * an OpenRouter key must be rewritten to `openrouter/anthropic/...` or it
 * will be overwritten the moment the picker mounts.
 *
 * Returns null when no configured provider can back this model.
 */
import type { ProviderContext } from "@/lib/orchestrator/types";
import { availableProviders } from "./registry";

const NATIVE_PREFIXES = new Set(["anthropic", "openai", "google"]);

export function normalizeModelIdForPicker(
  modelId: string,
  ctx: ProviderContext,
): string | null {
  const available = new Set(availableProviders(ctx));
  const slash = modelId.indexOf("/");
  if (slash === -1) return null;
  const prefix = modelId.slice(0, slash);

  if (prefix === "openrouter") {
    return available.has("openrouter") ? modelId : null;
  }
  if (prefix === "ollama") {
    return available.has("ollama") ? modelId : null;
  }
  if (prefix === "lmstudio") {
    return available.has("lmstudio") ? modelId : null;
  }
  if (prefix === "vllm") {
    // vLLM is env-only today; picker doesn't surface it. Don't suggest it.
    return null;
  }
  if (NATIVE_PREFIXES.has(prefix)) {
    if (available.has(prefix)) return modelId;
    if (available.has("openrouter")) return "openrouter/" + modelId;
    return null;
  }
  // Unknown prefix (x-ai/, deepseek/, meta-llama/, etc.). resolveModel routes
  // these through OpenRouter as a passthrough, but the picker snaps them
  // because the literal prefix does not match the openrouter tab. Rewrite to
  // an explicit openrouter/ prefix — resolveModel strips it before calling
  // the OpenRouter SDK, so routing is unchanged.
  if (available.has("openrouter")) return "openrouter/" + modelId;
  return null;
}
