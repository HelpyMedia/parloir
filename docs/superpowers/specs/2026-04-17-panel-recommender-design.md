# Panel Recommender for /sessions/new

**Date:** 2026-04-17
**Status:** Approved for implementation
**Related files:**
- `src/app/sessions/new/page.tsx`
- `src/components/session-new/NewSessionForm.tsx`
- `src/components/session-new/PanelPresetPicker.tsx` (to be replaced)
- `src/components/session-new/QuestionInput.tsx`
- `src/lib/providers/defaults.ts` (pattern to mirror)
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
4. **Depth selector** — the active pill slides to the new value using the same 150ms transition existing selectors use.

All four start within the same `requestAnimationFrame` so it reads as one action.

### Undo

The `Suggested ✓ — undo` chip captures a snapshot of the pre-suggestion state (`title`, `selectedIds`, `overrides`, `depth`) and restores it on click. Snapshot is cleared when the chip's 10s timeout fires or the user mutates any suggested field manually.

### Failure

Silent. On classifier failure (all models in chain failed, or API error) the button reverts to `Suggest a panel` and a single `console.warn` is emitted server-side. No toast, no inline error — the brief is explicit that the form must stay usable. The button remains available for retry.

## Architecture

### Endpoint

`POST /api/sessions/recommend-panel`

- Auth: `requireUser()` — same gate as other session endpoints.
- Request body: `{ question: string }` — title, if any, is ignored; the recommender owns title suggestion.
- Response (success): `{ title: string, personaIds: string[], overrides: Record<string,string>, depth: "short"|"standard"|"deep" }`.
- Response (total failure): `204 No Content`. Client treats as silent failure.
- Validation: `question.trim().length` in `[10, 4000]` — mirrors `canStart`. Out-of-range returns `400`.
- Rate limiting: none in v1. Classifier runs are pennies each via the cheap judge chain; revisit if abused.

### Classifier module

`src/lib/recommender/panel.ts` — exports `recommendPanel({ question, personas, ctx })`.

Uses `tryGenerateObject` against a model chain built by a new `pickClassifierModelChain(ctx, personaModels)` helper added to `src/lib/providers/defaults.ts`. The preference order is the same as the judge chain — cheap, fast, capable of structured output:

```ts
const CLASSIFIER_PREFERENCES = [
  { provider: "anthropic", modelId: "anthropic/claude-haiku-4-5" },
  { provider: "google",    modelId: "google/gemini-2.5-flash" },
  { provider: "openai",    modelId: "openai/gpt-4o-mini" },
  { provider: "openrouter",modelId: "openrouter/anthropic/claude-haiku-4.5" },
];
```

Falls back to the first persona's default model as a last resort (same pattern as `buildChain`). If the chain is empty or every candidate fails, the helper returns `null` and the endpoint responds `204`.

### Zod schema for classifier output

```ts
const RecommendationSchema = z.object({
  title: z.string().describe("Short session title, 3-8 words, no trailing period."),
  personaIds: z.array(z.string()).describe(
    "2 to 5 persona IDs from the provided roster. Order is seat order."
  ),
  overrides: z.record(z.string(), z.string()).describe(
    "Map of personaId -> modelId. Only include entries that differ from the persona's default model. Empty object is valid."
  ),
  depth: z.enum(["short", "standard", "deep"]),
  rationale: z.string().describe("One sentence explanation, for logging only."),
});
```

The endpoint strips `rationale` before responding — it's kept in server logs for debugging but not surfaced in the UI.

### Classifier prompt

System prompt tells the model:
- Its job is to configure a panel, not to answer the question.
- Hand-describes the roster by joining `persona.id`, `persona.role`, and `persona.tags` into a compact table the model can cite by id.
- Emits the recommended shape per the Zod schema.
- Depth heuristic — short = factual/quick; standard = comparison; deep = strategy/architecture.
- Override heuristic — only suggest an override when a persona's role meaningfully benefits from a different model than its default (e.g. domain expert on a legal question → bump to the heaviest available model; pragmatic operator → leave default). Must still be resolvable against the provided `ProviderContext` — the server filters unresolvable overrides before returning.

### Override safety net

After the classifier returns, the endpoint validates each suggested override by calling `resolveModel(modelId, ctx)` inside a try/catch. Any override that fails resolution is dropped from the response. A suggestion with all overrides dropped still succeeds — the form will just use persona defaults.

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
        │                        pickClassifierModelChain(ctx, personaModels)
        │                        tryGenerateObject(chain, schema, prompt)
        │                        validate overrides via resolveModel
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
| All classifier models fail | `204`, server `console.warn` with the error list |
| Classifier returns invalid persona IDs | Endpoint filters them; if result has <2 valid IDs, responds `204` |
| Classifier returns unresolvable override | Endpoint drops the override, keeps the rest |
| Network error on client | `catch` treats as `204` — silent no-op, button resets |

## Testing

No test runner is wired up in the repo. Manual validation before merge:

- Type a short/domain-specific question ("Should we migrate Postgres 16 → 17?") → expect 2–3 personas, maybe `deep`.
- Type a quick factual question → expect `short`.
- Disconnect all providers except Ollama → suggestion should return or silently no-op, never 500.
- Click suggest, then click undo → exact prior state restored.
- Click suggest twice rapidly → only one request in flight.
- Pre-fill title, click suggest → title is preserved.

`pnpm lint` and `pnpm typecheck` must pass.

## Open questions

None. Writing-plans skill will decompose the implementation into ordered tasks.
