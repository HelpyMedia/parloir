# Panel Recommender for /sessions/new

**Date:** 2026-04-17
**Status:** Approved for implementation
**Related files:**
- `src/app/sessions/new/page.tsx`
- `src/components/session-new/NewSessionForm.tsx`
- `src/components/session-new/PanelPresetPicker.tsx` (to be replaced)
- `src/components/session-new/QuestionInput.tsx`
- `src/components/session-new/ModelPickerInline.tsx` (consumer of normalized override IDs)
- `src/components/session-new/DepthSelector.tsx` (`quick | standard | deep` enum)
- `src/lib/providers/defaults.ts` (pattern to mirror, new `pickClassifierModelChain`)
- `src/lib/providers/registry.ts` (`resolveModel` precedence mirrored by normalizer)
- `src/lib/providers/catalog.ts` (curated model IDs for allowed-overrides list)
- `src/lib/orchestrator/try-generate-object.ts` (already logs chain failures)
- `personas/templates/*.json` (source of roster)

## Goal

Give a user who has typed a question a one-click way to produce a sensible panel configuration: a title, a 2–5-persona roster, per-persona model overrides, and a critique depth. The suggestion is advisory — the user can edit anything after it's applied, and silent failure leaves the form exactly as they left it.

This replaces the current "Panel preset — coming soon" stub with a real affordance, but keeps the interaction confined to a single button near the question input. No preset library, no marketplace — just a classifier that reads the question and emits one preset.

## Non-goals

- Rewriting the user's question text (separate future "Improve with AI" feature).
- Learning from past sessions. The classifier is stateless per-request.
- Presets saved to disk. Output is ephemeral — only applied to the current form.
- Recommending `mode` (only `decide` is enabled today).
- DB-backed personas. Roster is the template directory.

## UX

### Button placement and state

A compact secondary button lives **inside the `QuestionInput` card**, bottom-right of the textarea, aligned with existing affordances there. Label: `Suggest a panel`. Disabled state when:

- Question is under 10 characters (same threshold as the existing `canStart` guard)
- A suggestion request is in flight (shows `Thinking…` with a pulse)
- A suggestion was just applied — shows `Suggested ✓ — undo` for 10 seconds, then reverts to `Suggest a panel`

### Apply animation

Instant apply with coordinated transitions:

1. **Title** — if empty, types in character-by-character over ~400ms (CSS-driven, no JS typewriter). If the user already typed a title, it is **not** overwritten.
2. **Persona checklist** — persona rows animate a 150ms fade on check/uncheck transitions. The form's `selectedIds` is diffed with the recommendation; rows entering/leaving the selection glow with `--color-spot-halo` for 600ms.
3. **Model overrides** — dropdowns cross-fade their displayed label (opacity 0 → 1 over 200ms) as the new value is committed.
4. **Depth selector** — the active pill's color/border transitions to the new value using `DepthSelector`'s existing `transition-colors` rule (~150ms). No new motion primitives are introduced — call this out so nobody plans a slide animation that doesn't exist in the component today. If a sliding-pill effect is wanted later, it is explicit new UI work on `DepthSelector` itself and out of scope here.

All four start within the same `requestAnimationFrame` so it reads as one action.

### Undo

The `Suggested ✓ — undo` chip captures a snapshot of the pre-suggestion state (`title`, `selectedIds`, `overrides`, `depth`) and restores it on click. Snapshot is cleared when the chip's 10s timeout fires or the user mutates any suggested field manually.

### Failure

Silent. On classifier failure (all models in chain failed, or API error) the button reverts to `Suggest a panel`. No toast, no inline error — the brief is explicit that the form must stay usable. The button remains available for retry.

Server logging is delegated to `tryGenerateObject`, which already emits a single `console.warn` with the full per-model error list on total chain failure (`src/lib/orchestrator/try-generate-object.ts:51`). The endpoint adds no extra `console.warn` on that path to avoid duplicate noise. The endpoint DOES log (one `console.warn`) on its own paths that `tryGenerateObject` does not reach — empty available-provider chain, post-filter persona count < 2, post-filter override normalization failures that cross a threshold worth noting — so operators can tell "LLM failed" apart from "our validation rejected the result."

## Architecture

### Endpoint

`POST /api/sessions/recommend-panel`

- Auth: `requireUser()` — same gate as other session endpoints.
- Request body: `{ question: string }` — title, if any, is ignored; the recommender owns title suggestion.
- Response (success): `{ title: string, personaIds: string[], overrides: Record<string,string>, depth: "quick"|"standard"|"deep" }`. The `depth` enum matches `DEPTH_ROUNDS` in `src/components/session-new/DepthSelector.tsx:3` exactly so `NewSessionForm` can pass the value straight to state (`setDepth`) without a translation layer.
- Response (total failure): `204 No Content`. Client treats as silent failure.
- Validation: `question.trim().length` in `[10, 4000]` — mirrors `canStart`. Out-of-range returns `400`.
- Rate limiting: none in v1. Classifier runs are pennies each via the cheap judge chain; revisit if abused.

### Classifier module

`src/lib/recommender/panel.ts` — exports `recommendPanel({ question, personas, ctx })`.

Uses `tryGenerateObject` against a model chain built by a new `pickClassifierModelChain(ctx)` helper added to `src/lib/providers/defaults.ts`. The preference order is the same as the judge chain — cheap, fast, capable of structured output:

```ts
const CLASSIFIER_PREFERENCES = [
  { provider: "anthropic", modelId: "anthropic/claude-haiku-4-5" },
  { provider: "google",    modelId: "google/gemini-2.5-flash" },
  { provider: "openai",    modelId: "openai/gpt-4o-mini" },
  { provider: "openrouter",modelId: "openrouter/anthropic/claude-haiku-4.5" },
];
```

**Chain composition differs from `pickJudgeModelChain` on purpose.** The judge chain appends persona models as a last-resort fallback because, at judge time, those models are already known-good — the debate already successfully resolved them to start. At recommender time nothing has started, and every current template persona defaults to `anthropic/claude-opus-4.6` (see `personas/templates/*.json`). For a Google-only, OpenAI-only, or local-only user, appending that to the chain just produces extra failed attempts and latency. So:

- The classifier chain is built **only** from `CLASSIFIER_PREFERENCES` whose provider is in `availableProviders(ctx)`.
- No persona-default fallback is appended.
- If the resulting chain is empty (e.g., the user is local-only with no cloud keys), the endpoint returns `204` **without calling the LLM at all**. This is one of the endpoint's own log-worthy paths — emit a single `console.warn` as described under "Failure."
- If the chain is non-empty but every candidate fails, `tryGenerateObject` itself logs once and returns `null`; the endpoint responds `204` silently.

### Zod schema for classifier output

```ts
const RecommendationSchema = z.object({
  title: z.string().describe("Short session title, 3-8 words, no trailing period."),
  personaIds: z.array(z.string()).describe(
    "2 to 5 persona IDs from the provided roster. Order is seat order."
  ),
  overrides: z.record(z.string(), z.string()).describe(
    "Map of personaId -> modelId. Only include entries that differ from the persona's default model. Empty object is valid. Values must be drawn from the allowed-overrides list supplied in the prompt."
  ),
  depth: z.enum(["quick", "standard", "deep"]),
  rationale: z.string().describe("One sentence explanation, for logging only."),
});
```

The endpoint strips `rationale` before responding — it's kept in server logs for debugging but not surfaced in the UI.

### Classifier prompt

System prompt tells the model:
- Its job is to configure a panel, not to answer the question.
- Hand-describes the roster by joining `persona.id`, `persona.role`, and `persona.tags` into a compact table the model can cite by id.
- Emits the recommended shape per the Zod schema.
- Depth heuristic — `quick` = factual; `standard` = comparison; `deep` = strategy/architecture.
- Override heuristic — only suggest an override when a persona's role meaningfully benefits from a different model than its default (e.g. domain expert on a legal question → bump to the heaviest available model).
- **Allowed-overrides list (authoritative).** The prompt includes an explicit list of model IDs the classifier is permitted to use as override values. This list is assembled server-side from (a) the curated catalog (`src/lib/providers/catalog.ts`) for each cloud provider whose key is in `ctx`, and (b) a small hand-picked set of OpenRouter IDs if OpenRouter is in `ctx`. **Local model IDs (Ollama / LM Studio) are not included in the v1 allowed-overrides list at all** — we punt on live-enumerating local catalogs into the classifier prompt, and the override heuristic is biased toward cloud personas anyway. A fully local-only user (no cloud keys) will hit the empty-chain path and get a silent `204` before the LLM is called. Values outside the allowed list are rejected at validation time (see next section).

### Override pipeline

Three stages, all server-side:

1. **Pre-filter at prompt time** — the classifier only sees model IDs the current user can use, so it cannot hallucinate an OpenAI-only ID for an Anthropic-only user.
2. **Post-filter (allowlist check)** — each returned `overrides[personaId]` must appear in the allowed-overrides list built in step 1. Values outside the list are dropped.
3. **Prefix normalization.** The real source of breakage flagged in review: `ModelPickerInline.tsx:19` derives the picker's active provider from the *literal* prefix of the modelId, and `ModelPickerInline.tsx:66` auto-snaps the value to the active provider's first model whenever `providerOf(current) !== provider`. That means a server-approved `anthropic/claude-haiku-4-5` override for a user with no Anthropic key (but OpenRouter) will mount with `provider = "openrouter"`, the effect will fire, and the picker will immediately overwrite it.
    So every override must be rewritten to the prefix matching whichever provider `resolveModel` would actually route it through for this user, using a new helper:

    ```ts
    // src/lib/providers/normalize.ts
    export function normalizeModelIdForPicker(
      modelId: string,
      ctx: ProviderContext,
    ): string | null;
    ```

    Logic (mirrors `resolveModel` precedence without constructing a `LanguageModel`):

    - If `modelId` starts with `openrouter/` and ctx has openrouter → return as-is; else null.
    - If `modelId` starts with `ollama/` / `lmstudio/` and ctx has that local endpoint → return as-is; else null.
    - If `modelId` starts with a native prefix (`anthropic/` / `openai/` / `google/`):
      - If ctx has that native key → return as-is.
      - Else if ctx has openrouter → return `"openrouter/" + modelId`.
      - Else null.
    - Else (unknown prefix such as `x-ai/`, `deepseek/`, `meta-llama/`):
      - If ctx has openrouter → return `"openrouter/" + modelId`. Note: `resolveModel` routes unknown prefixes through OpenRouter as a passthrough, but the picker derives its provider tab from the literal prefix (`ModelPickerInline.tsx:19`) and snaps the value when the prefix doesn't match the active tab (`ModelPickerInline.tsx:69`). So for picker stability we must normalize unknown-prefix IDs to an explicit `openrouter/` prefix rather than returning them as-is. The resulting ID still resolves correctly because `resolveModel` strips `openrouter/` before handing the remainder to the OpenRouter SDK — so `openrouter/x-ai/grok-...` and the raw `x-ai/grok-...` route to the same OpenRouter call.
      - Else null.

    Any override where the helper returns `null` is dropped before responding. A suggestion with all overrides dropped still succeeds — the form uses persona defaults.

    This helper also lets the classifier prompt include natively-prefixed IDs in its allowed-overrides list when the backing is actually OpenRouter — we can pre-normalize the list before handing it to the classifier, so the model is guided toward writing IDs that will survive client mount.

### Client wiring

`NewSessionForm` gains:

- A `snapshot` ref holding pre-suggestion state for undo.
- A `suggestionStatus` state: `"idle" | "thinking" | "just-applied"`.
- A handler `handleSuggest()` that POSTs to the endpoint, applies the result via existing setters, and triggers the animation by toggling a CSS class on the form root for ~600ms.

`QuestionInput` gains a `suggestion` prop group: `{ onSuggest, disabled, status }`. It renders the button inline. The component remains presentational — it does not own the fetch.

`PanelPresetPicker` is deleted. Its slot in `NewSessionForm` is removed. (Its "coming soon" message is no longer accurate and leaving it duplicates the affordance.)

## Data flow summary

```
user types question
        │
        ▼
clicks "Suggest a panel"   ─────► POST /api/sessions/recommend-panel
        ▲                                   │
        │                                   ▼
        │                        loadProviderContext(userId)
        │                        listTemplatePersonas()
        │                        pickClassifierModelChain(ctx)      ── empty? 204
        │                        build allowed-overrides from ctx
        │                        tryGenerateObject(chain, schema, prompt)
        │                        filter personaIds to roster (<2? 204)
        │                        drop overrides not in allowed list
        │                        normalizeModelIdForPicker() per override
        │                                   │
        │           ┌────── 204 ────────────┤
        │           ▼                       ▼
   silent no-op          { title, personaIds, overrides, depth }
                                            │
                                            ▼
                              snapshot current form state
                              apply suggestion with animation
                              show "Suggested ✓ — undo" for 10s
```

## Error handling

| Failure | Behavior |
|---|---|
| User not authenticated | `401` from middleware — same as any other gated API |
| `question` too short / too long | `400` with the same JSON error shape as `/api/sessions` |
| No provider context (user connected nothing) | `204` — UI stays idle. Cannot happen today because the page already gates on `hasAny`. |
| Classifier chain empty (no available-provider matches) | `204`, one endpoint-level `console.warn`. LLM is not called. |
| All classifier models fail | `204`. `tryGenerateObject` already logged once; endpoint adds no second warn. |
| Classifier returns invalid persona IDs | Endpoint filters them; if result has <2 valid IDs, responds `204` with one endpoint-level `console.warn`. |
| Classifier returns override outside allowed list | Dropped silently (expected to be rare — allowed list is in the prompt). |
| Classifier returns override that fails `normalizeModelIdForPicker` | Dropped silently. |
| Network error on client | `catch` treats as `204` — silent no-op, button resets. |

## Testing

No test runner is wired up in the repo. Manual validation before merge:

- Type a short/domain-specific question ("Should we migrate Postgres 16 → 17?") → expect 2–3 personas, maybe `deep`.
- Type a quick factual question → expect `quick`.
- Disconnect all providers except Ollama → suggestion should return or silently no-op, never 500.
- Click suggest, then click undo → exact prior state restored.
- Click suggest twice rapidly → only one request in flight.
- Pre-fill title, click suggest → title is preserved.

`pnpm lint` and `pnpm typecheck` must pass.

## Open questions

None. Writing-plans skill will decompose the implementation into ordered tasks.
