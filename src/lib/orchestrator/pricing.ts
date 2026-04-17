/**
 * Per-million-token USD prices keyed by canonical model ID (the string
 * personas reference, e.g. "anthropic/claude-sonnet-4-6").
 *
 * This is a dev-grade estimator — providers return authoritative cost
 * metadata only via their own APIs and those don't flow through the AI
 * SDK's usage object uniformly. Good enough to show "you spent ~$0.12"
 * in the UI; not good enough to bill anyone.
 *
 * Update when adding new personas or when provider pricing changes.
 * Unknown models return 0 (same as today) rather than a wrong number.
 */

export interface TokenCost {
  inputPerMillion: number;
  outputPerMillion: number;
}

const PRICING: Record<string, TokenCost> = {
  // Anthropic
  "anthropic/claude-opus-4-7": { inputPerMillion: 15, outputPerMillion: 75 },
  "anthropic/claude-opus-4-6": { inputPerMillion: 15, outputPerMillion: 75 },
  "anthropic/claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
  "anthropic/claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },

  // OpenAI
  "openai/gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },

  // Google
  "google/gemini-2.5-pro": { inputPerMillion: 1.25, outputPerMillion: 5 },
  "google/gemini-2.5-flash": { inputPerMillion: 0.075, outputPerMillion: 0.3 },

  // Local / self-hosted — free at the margin.
  "ollama/llama3.2": { inputPerMillion: 0, outputPerMillion: 0 },
};

export function estimateCostUsd(
  modelId: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = PRICING[modelId];
  if (!p) return 0;
  return (
    (tokensIn * p.inputPerMillion) / 1_000_000 +
    (tokensOut * p.outputPerMillion) / 1_000_000
  );
}

/**
 * Prefer the provider's own cost report when it gives us one. OpenRouter
 * does (in USD) when we pass `providerOptions.openrouter.usage.include`.
 * Everyone else (direct Anthropic/OpenAI/Google SDKs, Ollama) returns
 * only tokens; fall back to the local pricing table.
 *
 * providerMetadata shape is defined by the AI SDK but keys/values are
 * provider-specific, so we narrow defensively.
 */
export function extractCostUsd(
  providerMetadata: unknown,
  modelId: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const authoritative = readOpenRouterCost(providerMetadata);
  if (authoritative !== null) return authoritative;
  return estimateCostUsd(modelId, tokensIn, tokensOut);
}

function readOpenRouterCost(providerMetadata: unknown): number | null {
  if (!providerMetadata || typeof providerMetadata !== "object") return null;
  const or = (providerMetadata as Record<string, unknown>).openrouter;
  if (!or || typeof or !== "object") return null;
  const usage = (or as Record<string, unknown>).usage;
  if (!usage || typeof usage !== "object") return null;
  const cost = (usage as Record<string, unknown>).cost;
  if (typeof cost === "number" && Number.isFinite(cost)) return cost;
  return null;
}
