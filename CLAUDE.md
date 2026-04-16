# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Parloir is a multi-agent debate platform: a panel of AI personas deliberates a question through a structured protocol and produces a synthesized deliverable. Pre-alpha — scaffold exists, first end-to-end session not yet shipped.

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
pnpm db:studio       # open Drizzle Studio
```

Local setup requires Postgres with pgvector. After `pnpm db:migrate`, run `psql $DATABASE_URL -f db/migrations/0000_setup.sql` to install the extension and seed data. Minimum env: `OPENROUTER_API_KEY`, `DATABASE_URL`. No test runner is wired up yet — `pnpm lint` and `pnpm typecheck` are the gates.

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

**Durable execution.** Debates take minutes and exceed Vercel's 300s serverless limit, so they run as Inngest functions (`src/lib/inngest/debate-workflow.ts`). The Next.js API triggers the `debate.requested` event; Inngest calls `runDebate` in a worker. Concurrency is keyed to `sessionId` with `limit: 1` to prevent double-run on resume.

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

## Known gaps to be aware of

- No auth yet; session `createdBy` is unwired.
- `buildToolset` doesn't call a real web search provider.
- Persona DB loading is a TODO — templates directory is the source of truth.
- No per-turn token budget enforcement; a runaway agent can burn tokens.
- Cost computation in `turn.costUsd` is stubbed to `0`.
