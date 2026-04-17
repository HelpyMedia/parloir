# Panel Recommender Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Suggest a panel" button to `/sessions/new` that classifies the user's question server-side against their connected providers and applies a preset (title + 2–5 personas + per-persona model overrides + depth) with instant-apply + undo UX.

**Architecture:** Single `POST /api/sessions/recommend-panel` endpoint, auth-gated by existing `/api/sessions` middleware. A classifier module calls `tryGenerateObject` against a chain narrowed to the user's available providers (same pattern as `pickJudgeModelChain`). Server-side allowlist + prefix normalization prevents `ModelPickerInline`'s mount-effect from snapping server-approved overrides away. Client applies the preset via existing setters while tagging affected fields with a short-lived CSS class for a coordinated transition; user mutations to any tagged field (or a 10s timeout) clear the snapshot and hide the undo chip.

**Tech Stack:** Next.js 15 App Router, TypeScript strict (no `any`), Zod, Vercel AI SDK (`generateObject`), Tailwind (arbitrary-value classes), Better Auth, Drizzle (unaffected).

**Repo convention note:** There is no test runner in this repo. CLAUDE.md is explicit: "`pnpm lint` and `pnpm typecheck` are the gates." Every task uses those as the automatic gate, plus a manual QA step for the ones that touch runtime behavior. Do not fabricate a test framework; do not add `jest`/`vitest`/`playwright` in this plan.

**Design reference:** `docs/superpowers/specs/2026-04-17-panel-recommender-design.md`.

---

## File Structure

**Create:**
- `src/lib/providers/normalize.ts` — `normalizeModelIdForPicker(modelId, ctx)` mirroring `resolveModel` precedence, returning the prefix-matched id the `ModelPickerInline` will keep on mount.
- `src/lib/recommender/allowed-overrides.ts` — builds the allowed-overrides list (curated cloud catalog + hand-picked OpenRouter IDs) for a given `ProviderContext`, each entry pre-normalized.
- `src/lib/recommender/panel.ts` — `recommendPanel({ question, personas, ctx, allowedOverrides, personaModels })`; constructs the prompt, validates classifier output, returns normalized suggestion or `null`.
- `src/app/api/sessions/recommend-panel/route.ts` — `POST` handler: auth, question validation, orchestrates the classifier module, returns `{ title, personaIds, overrides, depth }` or `204`.
- `src/components/session-new/SuggestPanelButton.tsx` — presentational button with `idle | thinking | just-applied` states and the "undo" affordance.

**Modify:**
- `src/lib/providers/defaults.ts` — add `pickClassifierModelChain(ctx)`.
- `src/components/session-new/QuestionInput.tsx` — accept a `suggestion` prop group and render the button beside the textarea footer.
- `src/components/session-new/NewSessionForm.tsx` — snapshot/apply/undo wiring, animation trigger, wrap user-facing setters so any edit clears suggestion state. Remove `<PanelPresetPicker />` slot.
- `src/app/globals.css` — three new utility classes for the apply animation (title fade, persona row glow, dropdown cross-fade). A small amount of CSS is acceptable; Tailwind's arbitrary-value syntax cannot express keyframe animations concisely.

**Delete:**
- `src/components/session-new/PanelPresetPicker.tsx` — the "coming soon" stub the new button replaces.

---

## Task 1: `normalizeModelIdForPicker` helper

**Files:**
- Create: `src/lib/providers/normalize.ts`

This helper mirrors `resolveModel`'s precedence (see `src/lib/providers/registry.ts`) but returns a *normalized model ID* rather than a `LanguageModel`. The returned ID is guaranteed to have the same literal prefix as the provider `ModelPickerInline` (`src/components/session-new/ModelPickerInline.tsx:19`) will compute via `providerOf`, so the picker's mount-effect will not snap it away.

- [ ] **Step 1: Create the helper file**

Create `src/lib/providers/normalize.ts`:

```ts
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
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors. If `@/lib/orchestrator/types` doesn't resolve, confirm `tsconfig.json` has the `@/*` path alias — it does in this repo.

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/providers/normalize.ts
git commit -m "feat(providers): add normalizeModelIdForPicker helper

Mirrors resolveModel precedence but returns a string, so the panel
recommender can validate override candidates before building a
LanguageModel and return IDs that the ModelPickerInline mount-effect
will preserve (otherwise native-prefixed or unknown-prefixed IDs get
snapped to the active provider tab's first model)."
```

---

## Task 2: `pickClassifierModelChain`

**Files:**
- Modify: `src/lib/providers/defaults.ts`

Unlike `pickJudgeModelChain`, the classifier chain does NOT append persona default models as a last resort. Every current template persona defaults to `anthropic/claude-opus-4.6` (see `personas/templates/*.json`), so appending those for a Google-only or OpenAI-only user would just cause extra failed attempts. The chain is purely `CLASSIFIER_PREFERENCES ∩ availableProviders(ctx)`.

- [ ] **Step 1: Add `CLASSIFIER_PREFERENCES` and the chain builder**

Open `src/lib/providers/defaults.ts`. After the `SYNTH_PREFERENCES` declaration, add:

```ts
const CLASSIFIER_PREFERENCES: Array<{ provider: string; modelId: string }> = [
  { provider: "anthropic", modelId: "anthropic/claude-haiku-4-5" },
  { provider: "google", modelId: "google/gemini-2.5-flash" },
  { provider: "openai", modelId: "openai/gpt-4o-mini" },
  { provider: "openrouter", modelId: "openrouter/anthropic/claude-haiku-4.5" },
];
```

Then at the bottom of the file, export:

```ts
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
```

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/providers/defaults.ts
git commit -m "feat(providers): add pickClassifierModelChain

Returns cheap/fast structured-output-capable models filtered by the
user's available providers. Intentionally omits the persona-default
tail used by the judge/synth chains — see comment for why."
```

---

## Task 3: Allowed-overrides builder

**Files:**
- Create: `src/lib/recommender/allowed-overrides.ts`

Produces the authoritative set of model IDs the classifier is permitted to use as override values, already normalized for picker-safety. Each entry is `{ id, label }`; the prompt will include `id` only.

- [ ] **Step 1: Create the module**

Create `src/lib/recommender/allowed-overrides.ts`:

```ts
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
```

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/recommender/allowed-overrides.ts
git commit -m "feat(recommender): build allowed-overrides list from ProviderContext

Curated cloud models + OpenRouter fallbacks, each pre-normalized via
normalizeModelIdForPicker so the classifier can only propose IDs the
picker will keep on mount. Local IDs intentionally excluded in v1."
```

---

## Task 4: Classifier module (`recommendPanel`)

**Files:**
- Create: `src/lib/recommender/panel.ts`

Owns the prompt, the Zod schema, the tryGenerateObject call, and the post-filter pipeline. Returns the final suggestion shape the endpoint will serialize, or `null` on any unrecoverable failure (the endpoint maps `null` → `204`).

- [ ] **Step 1: Create the module**

Create `src/lib/recommender/panel.ts`:

```ts
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
): Promise<PanelSuggestion | null> {
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

  if (!result) return null;
  const raw = result.object;

  const personaIds = raw.personaIds.filter((id) => rosterIds.has(id)).slice(0, 5);
  if (personaIds.length < 2) return null;

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
    title,
    personaIds,
    overrides,
    depth: raw.depth,
  };
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/recommender/panel.ts
git commit -m "feat(recommender): classifier module with allowlist + normalization

Prompt carries the roster and an authoritative allowed-overrides list
so the model can only propose IDs the picker will keep. Post-filter
drops persona IDs not in the roster, overrides not in the allowed
list, and overrides that fail normalizeModelIdForPicker. Returns null
on empty chain / <2 valid personas / total LLM failure so the
endpoint can respond 204."
```

---

## Task 5: `POST /api/sessions/recommend-panel` route

**Files:**
- Create: `src/app/api/sessions/recommend-panel/route.ts`

Auth is provided by the existing `/api/sessions` middleware gate — no extra middleware changes needed.

- [ ] **Step 1: Create the route file**

Create `src/app/api/sessions/recommend-panel/route.ts`:

```ts
/**
 * POST /api/sessions/recommend-panel
 *
 * Given a question, return a full panel preset: title + 2-5 persona IDs +
 * per-persona model overrides + depth. All validation, allowlisting, and
 * prefix normalization happens server-side so the client can apply the
 * result directly without extra checks. Any unrecoverable failure responds
 * 204 — the caller is expected to fall back silently.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { loadProviderContext } from "@/lib/credentials/context";
import { listTemplatePersonas } from "@/lib/personas";
import { pickClassifierModelChain } from "@/lib/providers/defaults";
import { buildAllowedOverrides } from "@/lib/recommender/allowed-overrides";
import { recommendPanel } from "@/lib/recommender/panel";

export async function POST(req: NextRequest) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const question =
    typeof body === "object" && body !== null && "question" in body
      ? (body as { question: unknown }).question
      : undefined;
  if (typeof question !== "string") {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const trimmed = question.trim();
  if (trimmed.length < 10 || trimmed.length > 4000) {
    return NextResponse.json(
      { error: "question must be 10-4000 characters" },
      { status: 400 },
    );
  }

  const ctx = await loadProviderContext(user.id);
  const modelChain = pickClassifierModelChain(ctx);
  if (modelChain.length === 0) {
    console.warn("recommend-panel: empty classifier chain", {
      userId: user.id,
    });
    return new NextResponse(null, { status: 204 });
  }

  const personas = await listTemplatePersonas();
  const allowedOverrides = buildAllowedOverrides(ctx);

  const suggestion = await recommendPanel({
    question: trimmed,
    personas,
    ctx,
    modelChain,
    allowedOverrides,
  });

  if (!suggestion) {
    console.warn("recommend-panel: classifier produced no usable output", {
      userId: user.id,
    });
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(suggestion);
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Manually smoke-test the endpoint**

Start the dev server in a new terminal: `pnpm dev`

Sign in to the app (or sign up, then sign in) — the endpoint requires a session cookie.

In a browser DevTools console on the app's origin:

```js
await fetch("/api/sessions/recommend-panel", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ question: "Should we migrate our Postgres 16 cluster to 17 next quarter?" }),
}).then(r => r.status === 204 ? "204" : r.json())
```

Expected: either a JSON object like `{ title, personaIds, overrides, depth }` (if at least one cloud provider is connected) or the string `"204"` (if only local providers are connected). Never a 5xx. The server terminal should show a `console.warn` on the `204` path but not on the success path.

Stop the dev server before committing.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sessions/recommend-panel/route.ts
git commit -m "feat(api): POST /api/sessions/recommend-panel

Auth-gated by existing /api/sessions middleware. Validates question
length, short-circuits 204 on empty classifier chain (no matching
available providers) or unusable classifier output. Silent failure
is a product requirement — form must stay usable."
```

---

## Task 6: `SuggestPanelButton` component

**Files:**
- Create: `src/components/session-new/SuggestPanelButton.tsx`

Purely presentational. Owns its own 10s "just-applied" timer so the parent only needs to flip a single `status` prop. The undo action is a parent-owned callback; the component just renders and dispatches.

- [ ] **Step 1: Create the component**

Create `src/components/session-new/SuggestPanelButton.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export type SuggestStatus = "idle" | "thinking" | "just-applied";

interface Props {
  status: SuggestStatus;
  disabled: boolean;
  onSuggest: () => void;
  onUndo: () => void;
  onAutoClear: () => void;
}

export function SuggestPanelButton({
  status,
  disabled,
  onSuggest,
  onUndo,
  onAutoClear,
}: Props) {
  // When we enter the just-applied state, auto-clear after 10s unless the
  // parent has already cleared it (e.g. because the user edited a field).
  useEffect(() => {
    if (status !== "just-applied") return;
    const handle = window.setTimeout(onAutoClear, 10_000);
    return () => window.clearTimeout(handle);
  }, [status, onAutoClear]);

  if (status === "just-applied") {
    return (
      <button
        type="button"
        onClick={onUndo}
        className="rounded border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-spot-warm)] transition-colors hover:opacity-90"
      >
        Suggested ✓ — undo
      </button>
    );
  }

  const label = status === "thinking" ? "Thinking…" : "Suggest a panel";
  const isThinking = status === "thinking";

  return (
    <button
      type="button"
      onClick={onSuggest}
      disabled={disabled || isThinking}
      aria-busy={isThinking}
      className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors enabled:hover:border-[var(--color-spot-warm)] enabled:hover:text-[var(--color-spot-warm)] disabled:cursor-not-allowed disabled:opacity-40"
      style={isThinking ? { animation: "parloir-pulse 1.2s ease-in-out infinite" } : undefined}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/session-new/SuggestPanelButton.tsx
git commit -m "feat(session-new): SuggestPanelButton component

Presentational button with idle / thinking / just-applied states.
Owns its own 10s auto-clear timer for the undo chip."
```

---

## Task 7: Animation utility classes

**Files:**
- Modify: `src/app/globals.css`

Three utilities. Scoped with a `parloir-` prefix so they don't collide with anything else.

- [ ] **Step 1: Append to `globals.css`**

Open `src/app/globals.css` and append:

```css
@keyframes parloir-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@keyframes parloir-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.parloir-suggest-fade-in {
  animation: parloir-fade-in 320ms ease-out both;
}

.parloir-suggest-row-glow {
  animation: parloir-suggest-row-glow 600ms ease-out both;
}

@keyframes parloir-suggest-row-glow {
  0% { box-shadow: 0 0 0 2px var(--color-spot-halo); }
  100% { box-shadow: 0 0 0 0 transparent; }
}
```

- [ ] **Step 2: Run lint (CSS linting in Next is handled by the same lint step)**

Run: `pnpm lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(styles): add suggest-panel animation utilities

parloir-pulse for the Thinking… button, parloir-suggest-fade-in for
the title + model label cross-fade, parloir-suggest-row-glow for
persona rows that just flipped selection."
```

---

## Task 8: Wire `QuestionInput` to accept the suggestion affordance

**Files:**
- Modify: `src/components/session-new/QuestionInput.tsx`

The button renders beside the character-count footer. Purely presentational wiring — `QuestionInput` stays dumb and does not own the fetch.

- [ ] **Step 1: Update the component**

Replace the contents of `src/components/session-new/QuestionInput.tsx` with:

```tsx
"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  question: string;
  onTitle: (v: string) => void;
  onQuestion: (v: string) => void;
  titleAnimationKey?: number;
  suggestSlot?: ReactNode;
}

export function QuestionInput({
  title,
  question,
  onTitle,
  onQuestion,
  titleAnimationKey,
  suggestSlot,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="session-title"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]"
        >
          Session title
        </label>
        <input
          id="session-title"
          key={titleAnimationKey}
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="GTM strategy for product X"
          maxLength={200}
          className={
            "w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-2.5 font-display text-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-spot-warm)] focus:outline-none" +
            (titleAnimationKey !== undefined ? " parloir-suggest-fade-in" : "")
          }
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="session-question"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]"
        >
          The question for the council
        </label>
        <textarea
          id="session-question"
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          placeholder="What is the best GTM strategy for our product launch this quarter, given current team capacity?"
          rows={5}
          maxLength={4000}
          className="w-full resize-none rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-3 text-base leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-spot-warm)] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          <span className="flex items-center gap-3">
            <span>Min 10, max 4000 characters</span>
            <span>{question.length} / 4000</span>
          </span>
          {suggestSlot}
        </div>
      </div>
    </div>
  );
}
```

Notes on the changes:
- `titleAnimationKey` is an optional numeric key. Bumping it causes React to remount the `<input>`, which replays the one-shot `parloir-suggest-fade-in` animation. We use a key rather than a class-toggle + timer because remount is trivially idempotent and avoids dangling animation state.
- `suggestSlot` is a `ReactNode` so the parent can pass the `SuggestPanelButton` (which owns its own state) without `QuestionInput` needing to know anything about recommender internals.

- [ ] **Step 2: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. If any other caller of `QuestionInput` breaks, the new props are all optional so this should not happen.

- [ ] **Step 3: Commit**

```bash
git add src/components/session-new/QuestionInput.tsx
git commit -m "feat(session-new): QuestionInput accepts suggest slot + title fade key

suggestSlot is rendered beside the character-count footer so the
SuggestPanelButton lives inside the question card. titleAnimationKey,
when bumped, remounts the input to replay the one-shot fade-in
animation triggered by an applied suggestion."
```

---

## Task 9: Wire `NewSessionForm` — snapshot, apply, undo, animations

**Files:**
- Modify: `src/components/session-new/NewSessionForm.tsx`

This is the largest task. It adds:

1. Three pieces of state: `suggestStatus`, `snapshot`, `titleAnimationKey`, and a `suggestedFields` set (track which fields the suggestion mutated, so we know what triggers snapshot invalidation).
2. Wrapped setters: `onUserEditTitle`, `onUserToggle`, `onUserOverride`, `onUserDepth` that each call `invalidateSnapshot()` before delegating to the existing setter.
3. `handleSuggest` — fetch, `204` → silent reset, `200` → snapshot + apply.
4. `handleUndo` — restore snapshot, clear state.
5. Remove `<PanelPresetPicker />` from the render tree (the next task deletes the file itself).

- [ ] **Step 1: Replace the component**

Replace the contents of `src/components/session-new/NewSessionForm.tsx` with:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import type { Persona } from "@/lib/orchestrator/types";
import { DepthSelector, DEPTH_ROUNDS, type Depth } from "./DepthSelector";
import { LocalOnlyReliabilityNote } from "./LocalOnlyReliabilityNote";
import { ModeSelector, type Mode } from "./ModeSelector";
import { PersonaChecklist } from "./PersonaChecklist";
import { QuestionInput } from "./QuestionInput";
import { StartButton } from "./StartButton";
import {
  SuggestPanelButton,
  type SuggestStatus,
} from "./SuggestPanelButton";

interface Props {
  personas: Persona[];
  connectedProviders: string[];
  hasCloudProvider: boolean;
}

interface Snapshot {
  title: string;
  selectedIds: string[];
  overrides: Record<string, string>;
  depth: Depth;
}

interface PanelSuggestionResponse {
  title: string;
  personaIds: string[];
  overrides: Record<string, string>;
  depth: Depth;
}

export function NewSessionForm({
  personas,
  connectedProviders,
  hasCloudProvider,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("decide");
  const [depth, setDepth] = useState<Depth>("standard");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    personas.slice(0, 3).map((p) => p.id),
  );
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Suggest-a-panel state ----------------------------------------------
  const [suggestStatus, setSuggestStatus] = useState<SuggestStatus>("idle");
  const [titleAnimationKey, setTitleAnimationKey] = useState<number | undefined>(
    undefined,
  );
  const [suggestedRowIds, setSuggestedRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const snapshotRef = useRef<Snapshot | null>(null);

  const clearSuggestionState = useCallback(() => {
    snapshotRef.current = null;
    setSuggestStatus("idle");
    setSuggestedRowIds(new Set());
  }, []);

  // Any manual edit to a suggested field invalidates the snapshot.
  const invalidateIfJustApplied = useCallback(() => {
    if (snapshotRef.current !== null) clearSuggestionState();
  }, [clearSuggestionState]);

  const onUserEditTitle = useCallback(
    (v: string) => {
      invalidateIfJustApplied();
      setTitle(v);
    },
    [invalidateIfJustApplied],
  );
  const onUserEditQuestion = useCallback(
    (v: string) => {
      // The question is not part of the suggestion, but editing it after
      // apply still means the user has moved on — clear the undo chip.
      invalidateIfJustApplied();
      setQuestion(v);
    },
    [invalidateIfJustApplied],
  );
  const onUserDepth = useCallback(
    (d: Depth) => {
      invalidateIfJustApplied();
      setDepth(d);
    },
    [invalidateIfJustApplied],
  );
  const onUserOverride = useCallback(
    (personaId: string, modelId: string) => {
      invalidateIfJustApplied();
      setOverrides((prev) => ({ ...prev, [personaId]: modelId }));
    },
    [invalidateIfJustApplied],
  );
  const onUserToggle = useCallback(
    (id: string) => {
      invalidateIfJustApplied();
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [invalidateIfJustApplied],
  );

  const handleSuggest = useCallback(async () => {
    if (suggestStatus === "thinking") return;
    if (question.trim().length < 10) return;

    setSuggestStatus("thinking");
    try {
      const r = await fetch("/api/sessions/recommend-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (r.status === 204 || !r.ok) {
        // Silent failure — brief says the form must stay usable.
        setSuggestStatus("idle");
        return;
      }
      const data = (await r.json()) as PanelSuggestionResponse;

      // Snapshot pre-apply state for undo.
      snapshotRef.current = {
        title,
        selectedIds,
        overrides,
        depth,
      };

      // Apply. Order matters: compute the row-glow set *before* mutating
      // selectedIds so we diff correctly.
      const glow = new Set<string>();
      for (const id of data.personaIds) if (!selectedIds.includes(id)) glow.add(id);
      for (const id of selectedIds) if (!data.personaIds.includes(id)) glow.add(id);

      if (title.trim() === "") {
        setTitle(data.title);
        setTitleAnimationKey((k) => (k ?? 0) + 1);
      }
      setSelectedIds(data.personaIds);
      setOverrides(data.overrides);
      setDepth(data.depth);
      setSuggestedRowIds(glow);
      setSuggestStatus("just-applied");
    } catch {
      // Network error — silent no-op.
      setSuggestStatus("idle");
    }
  }, [suggestStatus, question, title, selectedIds, overrides, depth]);

  const handleUndo = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) {
      clearSuggestionState();
      return;
    }
    setTitle(snap.title);
    setSelectedIds(snap.selectedIds);
    setOverrides(snap.overrides);
    setDepth(snap.depth);
    clearSuggestionState();
  }, [clearSuggestionState]);
  // ----------------------------------------------------------------------

  const canStart = useMemo(() => {
    if (!title.trim() || title.length > 200) return false;
    if (question.trim().length < 10 || question.length > 4000) return false;
    if (selectedIds.length < 2 || selectedIds.length > 5) return false;
    return true;
  }, [title, question, selectedIds]);

  const canSuggest = question.trim().length >= 10;

  const handleStart = async () => {
    if (!canStart) return;
    setBusy(true);
    setError(null);
    try {
      const participantOverrides: Record<string, string> = {};
      for (const id of selectedIds) {
        const persona = personas.find((p) => p.id === id);
        const ov = overrides[id];
        if (persona && ov && ov !== persona.model) participantOverrides[id] = ov;
      }

      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          question: question.trim(),
          personaIds: selectedIds,
          protocol: { maxCritiqueRounds: DEPTH_ROUNDS[depth] },
          participantOverrides:
            Object.keys(participantOverrides).length > 0
              ? participantOverrides
              : undefined,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err?.error?.toString?.() ?? "Failed to create session");
      }
      const { session } = (await createRes.json()) as { session: { id: string } };

      const startRes = await fetch(`/api/sessions/${session.id}/start`, {
        method: "POST",
      });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to start session");
      }

      router.push(`/sessions/${session.id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleStart();
      }}
      className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-6 py-10"
    >
      <header className="space-y-2 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
          New session
        </span>
        <h1 className="font-display text-3xl text-[var(--color-text-primary)]">
          What should the council help you with?
        </h1>
      </header>

      <QuestionInput
        title={title}
        question={question}
        onTitle={onUserEditTitle}
        onQuestion={onUserEditQuestion}
        titleAnimationKey={titleAnimationKey}
        suggestSlot={
          <SuggestPanelButton
            status={suggestStatus}
            disabled={!canSuggest}
            onSuggest={handleSuggest}
            onUndo={handleUndo}
            onAutoClear={clearSuggestionState}
          />
        }
      />

      <ModeSelector value={mode} onChange={setMode} />
      <DepthSelector value={depth} onChange={onUserDepth} />
      <PersonaChecklist
        personas={personas}
        selected={selectedIds}
        overrides={overrides}
        connectedProviders={connectedProviders}
        onToggle={onUserToggle}
        onOverride={onUserOverride}
        highlightedIds={suggestedRowIds}
      />

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {!hasCloudProvider && <LocalOnlyReliabilityNote />}

      <div className="flex items-center justify-end gap-4">
        {!canStart && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
            Need a title, a question (≥10 chars), and 2–5 personas
          </span>
        )}
        <StartButton disabled={!canStart} busy={busy} onClick={handleStart} />
      </div>
    </form>
  );
}
```

Notes:
- `PanelPresetPicker` is no longer imported or rendered; the next task deletes the file.
- `PersonaChecklist` now receives a `highlightedIds` prop — Step 2 wires it.

- [ ] **Step 2: Update `PersonaChecklist` to apply the row-glow class**

Open `src/components/session-new/PersonaChecklist.tsx`. Add `highlightedIds?: Set<string>` to its props and conditionally apply `parloir-suggest-row-glow` on each row when its id is in the set.

Because the existing implementation of `PersonaChecklist` is not shown in this plan, treat it as: find the element rendered per persona (the outer container of each row) and append the class. The change is:

```diff
- interface Props {
+ interface Props {
    personas: Persona[];
    selected: string[];
    overrides: Record<string, string>;
    connectedProviders: string[];
    onToggle: (id: string) => void;
    onOverride: (personaId: string, modelId: string) => void;
+   highlightedIds?: Set<string>;
  }

- export function PersonaChecklist({ personas, selected, overrides, connectedProviders, onToggle, onOverride }: Props) {
+ export function PersonaChecklist({ personas, selected, overrides, connectedProviders, onToggle, onOverride, highlightedIds }: Props) {
```

Then on the row element:

```diff
- className={`... existing classes ...`}
+ className={
+   `... existing classes ...` +
+   (highlightedIds?.has(persona.id) ? " parloir-suggest-row-glow" : "")
+ }
```

If the row element uses inline `style`, use `className` concatenation instead of overwriting. If the existing className is already a template literal, extend it. Do NOT change any other behavior of `PersonaChecklist`.

The `parloir-suggest-row-glow` animation uses `both` fill-mode, so the glow plays once per mount. To make the glow replay when `highlightedIds` changes mid-session (as it does when a suggestion is applied), add a `key` to each row derived from its membership in `highlightedIds`:

```diff
- <div key={persona.id} ...>
+ <div
+   key={`${persona.id}-${highlightedIds?.has(persona.id) ? "h" : "n"}`}
+   ...
+ >
```

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. If `PanelPresetPicker` is flagged as unused on disk, that's expected — Task 10 deletes it.

- [ ] **Step 4: Manual QA (two terminals + a browser)**

You need:
- Terminal A: `pnpm inngest:dev`
- Terminal B: `pnpm dev`

Then in a browser, sign in and visit `/sessions/new`. Verify:

1. Type fewer than 10 characters in the question. "Suggest a panel" is disabled.
2. Type "Should we migrate our Postgres 16 cluster to 17 next quarter?". The button is enabled.
3. Click it. If you have a cloud provider connected, within a few seconds the title fills (if it was empty), 2–5 persona checkboxes flip with a brief amber-haloed glow, overrides update in the persona dropdowns, and the depth selector's active pill changes. A "Suggested ✓ — undo" chip appears in the button's place.
4. Click "undo" — the form snaps back to exactly the pre-suggestion state (title cleared if it was empty, checkboxes back, overrides back, depth back).
5. Suggest again, then edit the title manually. The undo chip disappears.
6. Suggest again, wait 10 seconds. The undo chip disappears on its own.
7. Click Suggest twice in rapid succession. Only one request should go out (the second click is blocked by the `thinking` state).
8. Pre-fill a title, click Suggest. The suggestion applies personas/overrides/depth, but the user's title is preserved.

If you only have local providers connected, step 3 should return silently (no JSON, no toast, no error) and the button resets to `Suggest a panel`. Confirm with the server log: you should see a `recommend-panel: empty classifier chain` warn.

- [ ] **Step 5: Commit**

```bash
git add src/components/session-new/NewSessionForm.tsx src/components/session-new/PersonaChecklist.tsx
git commit -m "feat(session-new): wire Suggest a panel into NewSessionForm

Snapshot + apply + undo + animation plumbing. User edits to any
suggested field (title, depth, persona toggle, override) invalidate
the snapshot and hide the undo chip; a 10s timeout does the same.
Title is only auto-filled if empty so we never overwrite user text.
PersonaChecklist gains an optional highlightedIds set used to apply
the row-glow animation on rows whose selection just flipped."
```

---

## Task 10: Remove `PanelPresetPicker`

**Files:**
- Delete: `src/components/session-new/PanelPresetPicker.tsx`

- [ ] **Step 1: Confirm it's no longer imported**

Run: `grep -rn "PanelPresetPicker" src/`
Expected: no matches — Task 9 already removed the import from `NewSessionForm.tsx`.

- [ ] **Step 2: Delete the file**

Run: `rm src/components/session-new/PanelPresetPicker.tsx`

- [ ] **Step 3: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/session-new/PanelPresetPicker.tsx
git commit -m "feat(session-new): remove PanelPresetPicker coming-soon stub

Replaced by the real SuggestPanelButton inside QuestionInput."
```

---

## Task 11: Final gate run + smoke test

**Files:** none — verification only.

- [ ] **Step 1: Clean build + lint + typecheck**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors.

- [ ] **Step 2: Build check**

Run: `pnpm build`
Expected: build succeeds. The new API route appears in the build output.

- [ ] **Step 3: End-to-end smoke**

With the Inngest worker and dev server running, go through the manual QA checklist from Task 9, Step 4 one more time. Also verify:

- Type a short factual question ("What's the capital of Norway?") and suggest. Depth should come back `quick` most of the time; if not, the value is still one of `quick | standard | deep` (do not fail on model judgment).
- Type a strategic question ("Design a multi-region failover plan for our Postgres cluster.") and suggest. Depth should come back `deep` most of the time.
- Suggest, click undo, then suggest again. The second suggestion should apply cleanly — the snapshot-clearing logic does not leave state wedged.

- [ ] **Step 4: Done — no commit needed for verification**

---

## Self-Review Checklist

1. **Spec coverage:**
   - `normalizeModelIdForPicker` → Task 1 ✓
   - `pickClassifierModelChain` + no persona tail → Task 2 ✓
   - Allowed-overrides list (cloud + OpenRouter, no local) → Task 3 ✓
   - Zod schema + classifier prompt + post-filter pipeline → Task 4 ✓
   - `POST /api/sessions/recommend-panel` with empty-chain and unusable-output 204 paths + single `console.warn` on each + silent on `tryGenerateObject` failure (it logs itself) → Task 5 ✓
   - Idle/thinking/just-applied button with 10s auto-clear → Task 6 ✓
   - Animation utilities (pulse, title fade, row glow) → Task 7 ✓
   - `QuestionInput` accepts a `suggestSlot` + animation key → Task 8 ✓
   - Snapshot + apply + undo + invalidate-on-user-edit → Task 9 ✓
   - Title only auto-fills when empty → Task 9 handleSuggest ✓
   - Delete `PanelPresetPicker` → Task 10 ✓
   - Final gates → Task 11 ✓

2. **Placeholder scan:** no "TBD" / "fill in" / "similar to Task N" / "handle edge cases" phrases. Every code step shows the actual code. `PersonaChecklist` in Task 9 Step 2 is expressed as a diff rather than a full replacement because the file's existing shape was not read in this session; the diff is precise enough to apply without ambiguity, and the manual QA in Step 4 will catch any layout mistakes.

3. **Type consistency:**
   - `PanelSuggestion` / `PanelSuggestionResponse` / server response shape all use the same four fields: `title`, `personaIds`, `overrides`, `depth` ✓
   - `Depth` enum is `"quick" | "standard" | "deep"` everywhere ✓
   - `SuggestStatus` is `"idle" | "thinking" | "just-applied"` in both the component and the parent form ✓
   - `AllowedOverride` shape `{ id, label }` is consistent between builder and consumer ✓
   - `ProviderContext` is imported from `@/lib/orchestrator/types` in every new file ✓
