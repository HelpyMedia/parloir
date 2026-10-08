/**
 * Panel recommender. Reads the user's question, the persona roster and a
 * shortlist of live catalog models, asks a cheap classifier model for a
 * preset, and returns a validated suggestion.
 *
 * Failure modes handled in-module:
 *   - All classifier models fail → { kind: "llm_failed" } (tryGenerateObject logs).
 *   - <2 valid persona IDs after filtering → { kind: "no_usable_output" }.
 *   - Model picks outside the shortlist → replaced by the next unused
 *     shortlist model, so every seat always ends up with a usable model.
 */
import { z } from "zod";
import { tryGenerateObject } from "@/lib/orchestrator/try-generate-object";
import type { Persona, ProviderContext } from "@/lib/orchestrator/types";
import type { CatalogModel } from "@/lib/providers/openrouter-catalog";

export type Depth = "quick" | "standard" | "deep";

export interface PanelSuggestion {
  title: string;
  personaIds: string[];
  /** personaId → model ID, one entry per suggested persona. */
  overrides: Record<string, string>;
  depth: Depth;
}

export type RecommendResult =
  | { kind: "ok"; suggestion: PanelSuggestion }
  | { kind: "llm_failed" }
  | { kind: "no_usable_output" };

const SuggestionSchema = z.object({
  title: z
    .string()
    .describe("Short session title, 3-8 words, no trailing period, in the language of the question."),
  personaIds: z
    .array(z.string())
    .describe("2 to 5 persona IDs, chosen from the provided roster. Order is seat order."),
  models: z
    .array(z.object({ personaId: z.string(), modelId: z.string() }))
    .describe("One model per chosen persona. modelId MUST be copied verbatim from the model list."),
  depth: z.enum(["quick", "standard", "deep"]),
  rationale: z.string().describe("One sentence. For logging only."),
});

function rosterBlock(personas: Persona[]): string {
  return personas
    .map((p) => `- ${p.id} | ${p.role} | tags: ${p.tags.join(", ") || "—"}`)
    .join("\n");
}

function modelsBlock(models: CatalogModel[]): string {
  return models
    .map((m) => {
      const price = m.isFree ? "free" : `$${m.completionPerM}/M out`;
      const iq = m.intelligence !== null ? ` | intelligence ${m.intelligence}` : "";
      return `- ${m.id} | ${m.name} | ${price}${iq}`;
    })
    .join("\n");
}

export interface RecommendPanelParams {
  question: string;
  personas: Persona[];
  ctx: ProviderContext;
  modelChain: string[];
  /** Models the classifier may assign, best first. */
  shortlist: CatalogModel[];
}

export async function recommendPanel(params: RecommendPanelParams): Promise<RecommendResult> {
  const { question, personas, ctx, modelChain, shortlist } = params;

  const rosterIds = new Set(personas.map((p) => p.id));
  const allowedIds = new Set(shortlist.map((m) => m.id));

  const system = [
    "You are the panel configurator for Parloir, a multi-agent debate platform.",
    "Your job is to CONFIGURE A PANEL, not to answer the user's question.",
    "You will output a JSON object matching the provided schema. Nothing else.",
    "",
    "Persona roster (use these persona IDs verbatim):",
    rosterBlock(personas),
    "",
    "Available models (use these model IDs verbatim):",
    modelsBlock(shortlist),
    "",
    "Model rubric: give each persona a DIFFERENT model, preferably from different",
    "labs — diverse models disagree more usefully. Put the strongest models on the",
    "personas that matter most for this question.",
    "",
    "Depth rubric:",
    '  - "quick"    — factual / quick verification questions.',
    '  - "standard" — comparisons and trade-off questions.',
    '  - "deep"     — strategy, architecture, or high-stakes decisions.',
    "",
    "Title rubric: 3–8 words, no trailing period, no quotes, same language as the question.",
    "Pick 2–5 personas. Prefer diversity of role and tags over packing similar ones.",
  ].join("\n");

  const result = await tryGenerateObject<z.infer<typeof SuggestionSchema>>({
    modelChain,
    ctx,
    schema: SuggestionSchema,
    temperature: 0.3,
    attemptKind: "classifier",
    deadline: Date.now() + 45_000,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `QUESTION:\n${question.trim()}` },
    ],
  });

  if (!result) return { kind: "llm_failed" };
  const raw = result.object;

  const personaIds = [...new Set(raw.personaIds.filter((id) => rosterIds.has(id)))].slice(0, 5);
  if (personaIds.length < 2) return { kind: "no_usable_output" };

  const overrides: Record<string, string> = {};
  const used = new Set<string>();
  for (const { personaId, modelId } of raw.models ?? []) {
    if (!personaIds.includes(personaId) || overrides[personaId]) continue;
    if (!allowedIds.has(modelId) || used.has(modelId)) continue;
    overrides[personaId] = modelId;
    used.add(modelId);
  }
  // Fill any seat the classifier left empty or filled with an invalid ID.
  const spare = shortlist.map((m) => m.id).filter((id) => !used.has(id));
  for (const personaId of personaIds) {
    if (overrides[personaId]) continue;
    const next = spare.shift();
    if (next) overrides[personaId] = next;
  }

  return {
    kind: "ok",
    suggestion: {
      title: raw.title.trim().replace(/\.+$/, "").slice(0, 200),
      personaIds,
      overrides,
      depth: raw.depth,
    },
  };
}
