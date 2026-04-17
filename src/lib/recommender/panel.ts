/**
 * Panel recommender. Reads the user's question + connected providers +
 * persona roster, asks a cheap classifier model for a preset, and returns
 * a validated, normalized suggestion.
 *
 * Failure modes handled in-module:
 *   - Empty classifier chain → caller should short-circuit 204 before calling.
 *   - All classifier models fail → returns null (tryGenerateObject already logs).
 *   - <2 valid persona IDs after filtering → returns null (caller logs one warn).
 *   - Overrides outside allowed list or unresolvable via normalizer → dropped.
 */
import { z } from "zod";
import { tryGenerateObject } from "@/lib/orchestrator/try-generate-object";
import { normalizeModelIdForPicker } from "@/lib/providers/normalize";
import type { Persona, ProviderContext } from "@/lib/orchestrator/types";
import type { AllowedOverride } from "./allowed-overrides";

export type Depth = "quick" | "standard" | "deep";

export interface PanelSuggestion {
  title: string;
  personaIds: string[];
  overrides: Record<string, string>;
  depth: Depth;
}

/**
 * Discriminated result so the endpoint can log only on the path
 * tryGenerateObject does NOT already warn about. "llm_failed" is already
 * logged there; "no_usable_output" is our own post-filter rejection and
 * merits a separate warn so operators can tell the two apart.
 */
export type RecommendResult =
  | { kind: "ok"; suggestion: PanelSuggestion }
  | { kind: "llm_failed" }
  | { kind: "no_usable_output" };

const SuggestionSchema = z.object({
  title: z
    .string()
    .describe("Short session title, 3-8 words, no trailing period."),
  personaIds: z
    .array(z.string())
    .describe(
      "2 to 5 persona IDs, chosen from the provided roster. Order is seat order.",
    ),
  overrides: z
    .record(z.string(), z.string())
    .describe(
      "Map of personaId -> modelId. Only include entries where the override differs from the persona's default. Values MUST come from the allowed-overrides list. Empty object is valid.",
    ),
  depth: z.enum(["quick", "standard", "deep"]),
  rationale: z.string().describe("One sentence. For logging only."),
});

function rosterBlock(personas: Persona[]): string {
  return personas
    .map(
      (p) =>
        `- ${p.id} | ${p.role} | tags: ${p.tags.join(", ") || "—"} | default model: ${p.model}`,
    )
    .join("\n");
}

function allowedBlock(allowed: AllowedOverride[]): string {
  return allowed.map((a) => `- ${a.id}`).join("\n");
}

export interface RecommendPanelParams {
  question: string;
  personas: Persona[];
  ctx: ProviderContext;
  modelChain: string[];
  allowedOverrides: AllowedOverride[];
}

export async function recommendPanel(
  params: RecommendPanelParams,
): Promise<RecommendResult> {
  const { question, personas, ctx, modelChain, allowedOverrides } = params;

  const rosterIds = new Set(personas.map((p) => p.id));
  const allowedIds = new Set(allowedOverrides.map((a) => a.id));

  const system = [
    "You are the panel configurator for Parloir, a multi-agent debate platform.",
    "Your job is to CONFIGURE A PANEL, not to answer the user's question.",
    "You will output a JSON object matching the provided schema. Nothing else.",
    "",
    "Roster (use these persona IDs verbatim):",
    rosterBlock(personas),
    "",
    "Allowed override model IDs (use these verbatim, and only when a persona",
    "meaningfully benefits from swapping away from its default):",
    allowedBlock(allowedOverrides),
    "",
    "Depth rubric:",
    '  - "quick"    — factual / quick verification questions.',
    '  - "standard" — comparisons and trade-off questions.',
    '  - "deep"     — strategy, architecture, or high-stakes decisions.',
    "",
    "Title rubric: 3–8 words, no trailing period, no quotes, Title Case optional.",
    "Pick 2–5 personas. Prefer diversity of role and tags over packing similar ones.",
  ].join("\n");

  const user = `QUESTION:\n${question.trim()}`;

  const result = await tryGenerateObject<z.infer<typeof SuggestionSchema>>({
    modelChain,
    ctx,
    schema: SuggestionSchema,
    temperature: 0.3,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  if (!result) return { kind: "llm_failed" };
  const raw = result.object;

  const personaIds = raw.personaIds.filter((id) => rosterIds.has(id)).slice(0, 5);
  if (personaIds.length < 2) return { kind: "no_usable_output" };

  const overrides: Record<string, string> = {};
  for (const [personaId, modelId] of Object.entries(raw.overrides ?? {})) {
    if (!personaIds.includes(personaId)) continue;
    if (!allowedIds.has(modelId)) continue;
    const normalized = normalizeModelIdForPicker(modelId, ctx);
    if (!normalized) continue;
    const persona = personas.find((p) => p.id === personaId);
    if (persona && normalized === persona.model) continue;
    overrides[personaId] = normalized;
  }

  const title = raw.title.trim().replace(/\.+$/, "").slice(0, 200);

  return {
    kind: "ok",
    suggestion: {
      title,
      personaIds,
      overrides,
      depth: raw.depth,
    },
  };
}
