# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Parloir is a multi-agent debate platform: a panel of AI personas deliberates a question through a structured protocol and produces a synthesized deliverable. Alpha — full debates run end to end; the public instance runs this repo with `PARLOIR_HOSTED=1` (see docs/deploy.md).

## Commands

```bash
pnpm install
pnpm dev             # Next.js (App Router, turbo) on :3000
pnpm inngest:dev     # Inngest dev worker on :8288 — required to run debates locally
pnpm build           # next build
pnpm start           # next start
pnpm lint            # next lint (ESLint)
pnpm typecheck       # tsc --noEmit — must pass
pnpm db:generate     # generate Drizzle migration from schema
pnpm db:migrate      # apply migrations
pnpm db:deploy       # pgvector + migrations in one idempotent step (also run by vercel-build)
pnpm dev:mock-openrouter  # fake OpenRouter on :4010 for free local debates
pnpm db:studio       # open Drizzle Studio
```

Local setup requires Postgres with pgvector. `pnpm db:deploy` installs the `vector` extension and applies every migration in the right order (the `embeddings` table needs the extension first). Minimum env: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PARLOIR_ENCRYPTION_KEY`. Provider keys are configured per-user via `/settings` (BYOK); for single-user iteration, set `PARLOIR_DEV_INHERIT_ENV=1` plus `OPENROUTER_API_KEY` / etc. No test runner is wired up yet — `pnpm lint` and `pnpm typecheck` are the gates.

Two terminals are needed during dev: one for `pnpm inngest:dev`, one for `pnpm dev`. A debate will not run without the Inngest worker.

## Architecture

The core product is the **debate orchestrator**, a finite state machine over phases in `src/lib/orchestrator/`. The rest of the codebase exists to feed it inputs and pipe its outputs somewhere.

**Phase flow** (`protocol.ts` → `runDebate`):
1. `opening` — all agents answer in parallel, blind to each other (diversity preservation — this is load-bearing, do not make it sequential).
2. `critique` — sequential round-robin; each agent sees full prior transcript. Each turn must refine, critique-by-name, or concede (novelty requirement — prevents sycophancy).
3. `consensus_check` — cheap judge model (`consensus.ts`) emits a structured `ConsensusReport` with rankings and silencing recommendations.
4. `adaptive_round` (optional, RA-CR) — on last round without consensus: silence weakest, reorder so strongest speaks last.
5. `synthesis` — dedicated secretary model (`synthesis.ts`) produces the `SynthesisArtifact` deliverable.

Protocol rules are research-grounded (see `CONTRIBUTING.md` citations). Do not add protocol features without a citation.

**Durable execution.** Debates take minutes, so they run as Inngest functions (`src/lib/inngest/debate-workflow.ts`). The orchestrator never calls Inngest directly: it receives a `Durable` (`src/lib/orchestrator/durable.ts`) and wraps EVERY side effect — each model turn, consensus check, synthesis, status update and stream event — in `durable.step(id, fn)`. Inngest replays the function from the top after each step, so code between steps must be deterministic and step IDs must come from loop indexes and phase names, never from DB state. Breaking this rule re-runs paid model calls on every replay. Each step is capped well under 300s (turn timeout 150s, judge/secretary deadlines). The workflow is idempotent on `sessionId` (no concurrency key — that would serialize the parallel opening). API keys are loaded outside steps so they are never persisted as step output.

**Failure handling.** `runAgentTurn` (`turn.ts`) never throws for model errors: it emits `turn_failed` with a code from `model-errors.ts`. A panelist failing twice in a row is dropped; the debate aborts (`DebateAbortedError`, shown verbatim in the UI) only if fewer than two panelists answered the opening or the key is invalid. Judge and secretary walk a model chain and fall back to text-mode JSON parsing.

**Model health.** Every turn's outcome is recorded in `model_health` (`src/lib/models/health.ts`, via `Storage.recordModelOutcome`), shared across users. OpenRouter gates some free models per app (403 "only available on agentic harnesses") and its catalog doesn't say which, so a refusal marks the model restricted for 7 days: automatic pickers (`getCatalogWithHealth` → default panels, suggestions, judge/secretary) skip it and rank reliable models first; the picker shows it disabled. A failed debate opens `FailedModelsDialog`, and "Try again" reseats the panelists whose models failed (`src/lib/sessions/failed-seats.ts`).

**Streaming without coupling.** The orchestrator emits `StreamEvent`s through a `StreamSink` interface. In the Inngest worker, the sink writes each event into the `session_events` Postgres table (append-only, with a monotonic `seq` per session). The SSE endpoint at `src/app/api/sessions/[id]/stream/route.ts` tails that table. This decouples the workflow from any HTTP connection — users can close the tab and the debate continues; reconnects replay from any seq.

**Provider registry** (`src/lib/providers/registry.ts`) resolves `"provider/model"` strings to Vercel AI SDK `LanguageModel`s. Precedence: explicit prefixes (`openrouter/`, `ollama/`, `lmstudio/`, `vllm/`) are forced; native prefixes (`anthropic/`, `openai/`, `google/`) prefer the direct SDK if the API key is set, else fall back to OpenRouter; unknown prefixes default to OpenRouter. Personas reference models by this unified ID — do not import providers elsewhere.

**Persona loading** (`src/lib/personas/index.ts`) currently reads only from `personas/templates/*.json`. DB-backed loading is a TODO; do not assume DB personas work yet.

**Storage interface.** The orchestrator depends on a `Storage` interface (see `protocol.ts`), not directly on Drizzle. The concrete implementation lives in `src/lib/db/client.ts`. Keep this indirection — it makes the orchestrator unit-testable without Postgres.

## Conventions (from CONTRIBUTING.md)

- Plain TypeScript, not frameworks. Custom state machine, not LangGraph/Mastra.
- Postgres for everything that fits: event queue, vector store, session state.
- One concept per file. Split at ~400 lines.
- No `any`. Use `unknown` + narrowing.
- Comments explain why, not what.
- Protocol changes cite a paper.

## Where to add things

- New persona → `personas/templates/<slug>.json`.
- New provider → `src/lib/providers/registry.ts` (extend `resolveModel`).
- New tool → `src/lib/tools/index.ts` (register in the `TOOLS` map consumed by `buildToolset`).
- Protocol change → `src/lib/orchestrator/protocol.ts`, with a ROADMAP note and citation.
- UI → `src/components/`. Keep it terminal-feeling, not dashboard-feeling.

## Iterating on the protocol

For protocol work, run debates with `ollama/llama3.2` as every persona — pennies per session, fast feedback loop. Validate cross-provider behavior only after the logic is right.

## Auth + BYOK

Live as of 2026-04-17. Parloir is multi-tenant: every user signs in and brings their own provider credentials.

- **Auth:** Better Auth (email + password, no OAuth in v1). Config at `src/lib/auth/config.ts`; routes at `/api/auth/[...all]`. Session cookie; `getCurrentUser()` / `requireUser()` helpers at `src/lib/auth/server.ts`. Middleware (`src/middleware.ts`) gates `/sessions`, `/settings` and the private API prefixes listed in `PROTECTED_API`. Optional email verification via Resend (`src/lib/auth/email.ts`) when `RESEND_API_KEY` is set. `DELETE /api/account` erases a user and everything they own (FK cascades).
- **Credentials:** Per-user API keys are stored AES-256-GCM–encrypted in `user_credentials` (keyed on `(userId, provider)`). Local server URLs (Ollama, LM Studio) in `user_provider_settings`. Encrypt/decrypt via `src/lib/crypto/keyring.ts` using `PARLOIR_ENCRYPTION_KEY` (32 bytes, base64). Service layer at `src/lib/credentials/service.ts`; REST at `/api/credentials`, `/api/credentials/[provider]`, `/api/credentials/[provider]/test`.
- **Provider registry (per-request):** `resolveModel(modelId, ctx: ProviderContext)` — no module-level singletons. The context is loaded on every workflow invocation, deliberately outside any step so keys never land in Inngest's step state, via `loadProviderContext(session.createdBy)` and threaded through `runDebate` → phase functions → `runAgentTurn`. Dev shim: `PARLOIR_DEV_INHERIT_ENV=1` restores the old `process.env` behavior for single-user iteration.
- **Models are never pinned in code.** The live OpenRouter catalog (`src/lib/providers/openrouter-catalog.ts`, cached 1h) drives the picker (`components/models/ModelPicker.tsx`), default panels (diverse labs, one per model tier: Free / Low cost / Medium / High intelligence, defined by price ceilings in `src/lib/models/tiers.ts` and ranked by intelligence index; accounts with OpenRouter credit default to Low cost, others to Free; `src/lib/models/cost-estimate.ts` shows the per-debate estimate), the panel recommender, and the automatic judge/secretary, which are resolved once at session creation (`src/lib/sessions/model-picks.ts`) and stored in `protocol`. `sessions.participant_model_overrides` holds one model per panelist; persona templates carry no model. Don't add hardcoded model IDs — they go stale.
- **Hosted edition:** `PARLOIR_HOSTED=1` (`src/lib/config/edition.ts`) restricts providers to OpenRouter, disables local servers, rejects non-openrouter model IDs, and turns on per-user debate caps (`src/lib/sessions/quota.ts`). "Connect with OpenRouter" is OAuth PKCE (`src/lib/credentials/openrouter-oauth.ts`, `/api/openrouter/*`).
- **Required env:** `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `PARLOIR_ENCRYPTION_KEY`, `DATABASE_URL`. No provider keys are required on the server anymore — users supply their own.

## Known gaps to be aware of

- `buildToolset` doesn't call a real web search provider, so no template persona enables tools.
- Persona DB loading is a TODO — templates directory is the source of truth.
- Output is capped per call (`maxOutputTokens`) but there is no per-session cost budget.
- Cost comes from OpenRouter's usage accounting; direct-provider keys fall back to a small static price table, and judge/secretary calls aren't counted yet.
- Rate limiting for app routes is in-memory per instance; auth limits and debate quotas are Postgres-backed.
- vLLM provider is supported in `resolveModel` but not BYOK-configurable yet (still reads `VLLM_BASE_URL` from env).
- Key rotation: if `PARLOIR_ENCRYPTION_KEY` changes, stored credentials must be manually re-encrypted — no tooling ships for this.

## Pause / Inject / Resume

Live as of 2026-04-16. Entry points:

- `POST /api/sessions/[id]/pause` sets `sessions.pause_requested_at`. The orchestrator checks this at every phase boundary (`drainInjectionsAndWait` in `protocol.ts`) and suspends via Inngest's `step.waitForEvent("debate.resumed")`.
- `POST /api/sessions/[id]/inject` enqueues a `HumanInjection` row (`pending_injections` table). Drained transactionally (`SELECT FOR UPDATE`) at the next phase boundary and appended to the transcript as a `speakerRole: "human"` turn.
- `POST /api/sessions/[id]/resume` clears `pause_requested_at`, then emits `debate.resumed`. The flag is the source of truth: the workflow waits in chunks and re-checks it, so a resume racing the wait is never lost.
- UI: `SessionShell` renders `PausedOverlay` when `state.phase === "paused"` or an injection prompt event arrived. `StickyActionBar` toggles pause/resume.

Known minor gaps in this feature:
- `pending_injections.delivered_turn_id` is reserved but not yet populated (best-effort audit trail only).
- A very fast double-resume can orphan an Inngest `debate.resumed` event (harmless; the next pause still works).
- No explicit UI affordance for the brief pause-request-pending window (request → first phase boundary hit).
