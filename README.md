# Parloir

> A space for AI agents to deliberate.

Parloir assembles a panel of AI agents — each with a distinct role, model, and perspective — to debate hard questions and reach a durable consensus. Instead of one confident answer from one model, you get structured deliberation across multiple models that you can trust, trace, and export.

**Status:** pre-alpha. Core scaffold is in place; the first end-to-end session will run soon. Star the repo to follow along.

---

## Why this exists

"Multi-agent" tools today are mostly four chat windows stapled together. Parloir implements a real **debate protocol** grounded in the multi-agent debate (MAD) research literature:

1. **Independent opening statements** — agents answer blind to each other, preserving diversity
2. **Structured critique rounds** — sequential with full visibility; every turn must bring something new
3. **Consensus check** — a lightweight judge model evaluates convergence
4. **Adaptive rounds** — a rank-adaptive protocol reorders speakers and silences the weakest argument
5. **Synthesis** — a dedicated "secretary" agent produces the final decision-grade deliverable

The protocol is designed around key findings from MAD research: diversity matters more than round count, hidden confidences prevent over-confidence cascades, and judge-ranked adaptive rounds converge faster than naive round-robin debate.

## What Parloir is good for

- **Technical decisions** where the cost of being wrong is high (architecture choices, vendor selection, migration timing)
- **Strategic brainstorming** where multiple perspectives matter more than a single confident answer
- **Pre-mortems** where a devil's-advocate panel surfaces failure modes before commitment
- **Research synthesis** where contradictions in the source material need to be surfaced, not smoothed over

## Stack

- **Frontend:** Next.js 15 (App Router) + Tailwind + shadcn/ui
- **Streaming:** Vercel AI SDK v5
- **Providers:** OpenRouter (default), direct Anthropic/OpenAI/Google, Ollama, LM Studio, vLLM
- **Orchestration:** custom TypeScript state machine — no framework lock-in
- **Durable execution:** Inngest (bypasses Vercel's 300s function timeout)
- **Database:** Postgres + Drizzle ORM + pgvector
- **Tools:** MCP client, web search, RAG over uploaded docs
- **Observability:** Langfuse (self-hostable)

## Quickstart

```bash
pnpm install
cp .env.example .env.local
# Minimum: OPENROUTER_API_KEY and DATABASE_URL
psql $DATABASE_URL -f db/migrations/0000_setup.sql
pnpm db:generate
pnpm db:migrate

# Two terminals:
pnpm inngest:dev    # local workflow runner
pnpm dev            # Next.js
```

Open http://localhost:3000 and start a session.

## Architecture

```
src/
├── app/                      Next.js App Router
│   ├── api/
│   │   ├── sessions/         Session CRUD, streaming endpoints
│   │   └── inngest/          Inngest webhook
│   └── (session)/            Session UI routes
├── components/               React components
├── lib/
│   ├── orchestrator/         The debate state machine — the heart
│   │   ├── protocol.ts       Phase transitions, turn selection
│   │   ├── consensus.ts      Judge logic, convergence detection
│   │   ├── synthesis.ts      Secretary agent
│   │   └── types.ts          Shared types
│   ├── providers/            Provider abstraction
│   ├── personas/             Persona templates + loader
│   ├── tools/                Web search, MCP, RAG
│   ├── db/                   Drizzle schema + queries
│   └── inngest/              Background workflow definitions
└── personas/templates/       Default persona JSON library
```

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the phased build plan. In summary:

- **Phase 1** — Core debate loop with streaming (current)
- **Phase 2** — Persona library and decision trails
- **Phase 3** — Tools, RAG, MCP integration
- **Phase 4** — Human-in-the-loop controls
- **Phase 5** — Collaboration, teams, hosted SaaS

## Self-hosting and hosted version

Parloir is fully open source and self-hostable. The entire deliberation engine — the protocol, the orchestrator, all personas, all providers, all features — lives in this repository under Apache 2.0. You can run it for yourself, for your team, or commercially inside your own organization, with no attribution or payment required beyond the license terms.

A managed hosted version is also planned at [parloir.dev](https://parloir.dev) for teams who'd rather not run Postgres, Inngest workers, and provider accounts themselves. The hosted version is a deployed instance of this same codebase — it doesn't hold back features. What you pay for is managed infrastructure, uptime, support, and eventual team-collaboration features designed for organizations running many sessions at scale.

If you self-host and build something you find useful, we'd love to hear about it.

## Contributing

Contributions welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for the contribution guide, code style, and research citations behind the protocol design.

## Research references

The debate protocol draws on:

- Du et al., *Improving Factuality and Reasoning in Language Models with Multiagent Debate* (2023)
- Liang et al., *Encouraging Divergent Thinking in LLMs through Multi-Agent Debate* (2023)
- Wu et al., *Rethinking Multi-Agent Debate* (2025)
- *The impact of multi-agent debate protocols on debate quality* (2026) — RA-CR protocol

## License

Apache 2.0 — see [LICENSE](./LICENSE). Copyright 2026 Helpy Media Inc.

Built in Montréal 🍁 by [Helpy Media](https://helpymedia.com).
