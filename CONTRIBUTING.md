# Contributing

## Philosophy

Roundtable is deliberately small and readable. Before adding a dependency, ask: can this be done in ~100 lines of our own code? The core debate protocol is ~400 lines on purpose — if you can't hold it in your head, you can't confidently change it.

We favor:
- **Plain TypeScript over frameworks.** Custom state machine over LangGraph/Mastra.
- **Postgres for everything that can live there.** Event queue, vector store, session state.
- **Real research over "AI best practices" blog posts.** If you're adding a protocol feature, cite the paper.

## Getting started

```bash
pnpm install
cp .env.example .env.local
# Add at minimum OPENROUTER_API_KEY and DATABASE_URL
psql $DATABASE_URL -f db/migrations/0000_setup.sql
pnpm db:generate
pnpm db:migrate

# Two terminals:
pnpm inngest:dev    # Inngest local dev server at :8288
pnpm dev            # Next.js at :3000
```

## Where to add things

- **New persona template?** → `personas/templates/<slug>.json`. Pull a PR.
- **New provider?** → `src/lib/providers/registry.ts`. Add to `resolveModel`.
- **New tool?** → `src/lib/tools/index.ts`. Register it in the `TOOLS` map.
- **Protocol change?** → `src/lib/orchestrator/protocol.ts`. Add a roadmap note + a research citation.
- **UI change?** → `src/components/`. Keep components small; the round-table should feel like a terminal, not a dashboard.

## Testing debates

The cheapest way to iterate on protocol changes is to run debates with `ollama/llama3.2` as every persona — pennies per session, fast. Once the logic is right, test with real cross-provider panels.

## Research references

If you're adding to the debate protocol, here are the papers that shaped the current design:

- Du et al., "Improving Factuality and Reasoning in Language Models with Multiagent Debate" (2023)
- Liang et al., "Encouraging Divergent Thinking in Large Language Models through Multi-Agent Debate" (2023)
- Smit et al., "Should we use LLMs to debate each other to improve factuality?" (2023)
- Wu et al., "Rethinking Multi-Agent Debate" (2025) — key finding: heterogeneity matters more than round count
- "The impact of multi-agent debate protocols on debate quality" (arxiv 2026) — RA-CR protocol we use

## Code style

- `pnpm lint` and `pnpm typecheck` must pass.
- One concept per file. If a file has more than ~400 lines, consider splitting.
- Comments should explain *why*, not *what*. The code already says what.
- No `any`. Use `unknown` + narrowing.
