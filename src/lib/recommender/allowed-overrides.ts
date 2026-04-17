/**
 * Build the allowed-overrides list the classifier sees in its prompt.
 *
 * Entries are assembled from the curated cloud catalog + a small hand-picked
 * set of OpenRouter fallbacks, then passed through normalizeModelIdForPicker
 * so the IDs are already safe for the picker to consume. Local model IDs
 * (ollama/, lmstudio/) are intentionally omitted in v1 — we do not live-
 * enumerate local catalogs at classifier time, and local-only users hit the
 * empty-chain 204 before ever calling the classifier anyway.
 */
import type { ProviderContext } from "@/lib/orchestrator/types";
import { CURATED } from "@/lib/providers/catalog";
import { normalizeModelIdForPicker } from "@/lib/providers/normalize";

export interface AllowedOverride {
  id: string;
  label: string;
}

const OPENROUTER_FALLBACKS: AllowedOverride[] = [
  { id: "openrouter/anthropic/claude-opus-4.7", label: "Claude Opus 4.7 (OpenRouter)" },
  { id: "openrouter/anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6 (OpenRouter)" },
  { id: "openrouter/anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5 (OpenRouter)" },
  { id: "openrouter/openai/gpt-4o", label: "GPT-4o (OpenRouter)" },
  { id: "openrouter/openai/gpt-4o-mini", label: "GPT-4o mini (OpenRouter)" },
  { id: "openrouter/google/gemini-2.5-pro", label: "Gemini 2.5 Pro (OpenRouter)" },
];

export function buildAllowedOverrides(ctx: ProviderContext): AllowedOverride[] {
  const out: AllowedOverride[] = [];
  const seen = new Set<string>();

  const push = (raw: AllowedOverride) => {
    const normalized = normalizeModelIdForPicker(raw.id, ctx);
    if (!normalized) return;
    if (seen.has(normalized)) return;
    seen.add(normalized);
    out.push({ id: normalized, label: raw.label });
  };

  for (const entry of CURATED.anthropic) push(entry);
  for (const entry of CURATED.openai) push(entry);
  for (const entry of CURATED.google) push(entry);
  for (const entry of OPENROUTER_FALLBACKS) push(entry);

  return out;
}
