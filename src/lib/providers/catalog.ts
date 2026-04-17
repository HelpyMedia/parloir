/**
 * Curated model lists for providers that lack a usable public `/models`
 * endpoint (Anthropic has one but it requires auth to list; OpenAI/Google
 * require keys). We serve these as defaults — users can override later.
 *
 * Keep in sync with the latest model releases; these are the dropdown
 * options users see when picking a model for a persona.
 */
export interface CuratedModel {
  id: string;
  label: string;
}

export const CURATED: Record<"anthropic" | "openai" | "google", CuratedModel[]> = {
  anthropic: [
    { id: "anthropic/claude-opus-4-7", label: "Claude Opus 4.7" },
    { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { id: "anthropic/claude-haiku-4-5", label: "Claude Haiku 4.5" },
  ],
  openai: [
    { id: "openai/gpt-4o", label: "GPT-4o" },
    { id: "openai/gpt-4o-mini", label: "GPT-4o mini" },
    { id: "openai/o1", label: "o1" },
  ],
  google: [
    { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
};
