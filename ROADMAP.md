# Roadmap

Phased build plan. Each phase is self-contained and ships value — you can stop at any phase and still have a useful tool.

## Phase 1 — Core debate loop (2-3 weeks part-time)

**Goal:** run a single full debate end-to-end with streaming, from a hardcoded session config.

- [x] Project scaffold (this repo)
- [x] Provider registry (OpenRouter + Anthropic + OpenAI + Ollama + LM Studio)
- [x] Orchestrator state machine (protocol.ts, consensus.ts, synthesis.ts)
- [x] Drizzle schema + storage adapter
- [x] Inngest workflow for durable execution
- [x] SSE streaming endpoint
- [x] `SessionView` React component (transcript + seats + phase indicators)
- [ ] `/new` page with a persona picker and question form
- [ ] Basic auth (Better Auth or Clerk) — even just single-user mode to unblock dev
- [ ] Wire `buildToolset` to actually call a web search provider (Brave or Tavily)
- [ ] Load 5 default personas into DB on first run
- [ ] End-to-end smoke test: create session, start, watch full debate, see synthesis

**Exit criteria:** can run a 3-agent × 2-round debate from the UI, watch it stream in real time, and export the result as Markdown.

## Phase 2 — Persona system & decision trail (1-2 weeks)

- [ ] Persona editor UI — create/edit/clone personas from the browser
- [ ] Persona library browser with tags + search
- [ ] Per-session cost meter with breakdown by persona
- [ ] Decision trail view: full transcript with round boundaries, filterable by speaker
- [ ] Session replay — view a completed session with all phases
- [ ] Branching: "what if we had used persona X instead?" — fork a session at any turn
- [ ] Markdown + PDF export
- [ ] Session sharing via signed URL (read-only)

## Phase 3 — Tools, RAG, MCP (1-2 weeks)

- [ ] MCP client integration — load user-configured MCP servers as tools
- [ ] Document upload → embedding → per-session RAG
- [ ] Web search tool (Brave or Tavily), surfaced per-persona
- [ ] Local model support in the UI (Ollama + LM Studio model picker)
- [ ] vLLM endpoint configuration per-persona
- [ ] Tool-call UI: expandable blocks inside turns showing search queries + results

## Phase 4 — Human-in-the-loop (1-2 weeks)

- [ ] Pause button actually pauses Inngest workflow (via `step.waitForEvent`)
- [ ] Interject input inserts a human turn between agent turns
- [ ] User vote/override: force a specific decision, provide reasoning
- [ ] Swap persona mid-session (remove + add participant without restart)
- [ ] Slack integration: post synthesis to a channel, DMs when a session completes
- [ ] Notion export (via user OAuth)

## Phase 5 — Collaboration & productization (optional, post-v1)

- [ ] Multi-user sessions: multiple humans observing the same debate
- [ ] Team workspaces with RBAC
- [ ] Per-team persona libraries
- [ ] Billing / usage tracking if you plan to host it
- [ ] Langfuse integration for observability
- [ ] OpenTelemetry exports
- [ ] Rate limiting per team
- [ ] Self-host guide: docker-compose with Postgres + Inngest + Next.js

## Open research questions (track as GitHub issues)

- **Consensus detection quality.** Current judge is prompted; might benefit from a small fine-tuned classifier.
- **Persona drift.** Over many sessions, does a persona template need updating as models change?
- **Cross-model fairness.** If the panel is Opus + GPT + Gemini, does one model dominate? Measure this.
- **Token budget per phase.** Right now no hard budget enforcement — a runaway agent can burn through tokens. Add per-turn max tokens with graceful cutoff.
- **Replay determinism.** For regression testing, we need to be able to replay a debate with recorded provider responses.
