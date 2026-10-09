# Web research

Panel models only know what was in their training data. Ask about a product released last month and
they guess. With web research, the council looks things up when the question needs it, argues from real
sources, and the final deliverable cites them.

Search runs through [OpenRouter's web plugin](https://openrouter.ai/docs/features/web-search) on each
user's own OpenRouter key (engine `exa` by default). There is no separate search API key.

## How it works

1. **Gate** (`src/lib/research/gate.ts`). Before the openings, the judge model makes one structured
   call. It is told today's date and decides whether the question needs the web. It searches for:
   named products, companies, people, tools or models; prices, laws, regulations or market conditions;
   recent events; anything that might postdate training; names it doesn't recognize. It doesn't search
   for pure reasoning, values, personal decisions where the person gave the facts, or creative and
   strategic questions with no outside facts. When unsure, it searches. If no model can decide, the
   question itself becomes the query.
2. **Research phase** (`src/lib/orchestrator/research.ts`). Up to 3 queries run in parallel, each in its
   own durable step (`src/lib/research/web.ts`). The pages found go into the session's **source
   registry** (`sessions.sources`) and are numbered `S1`, `S2`, … for the whole session. The judge then
   writes an **evidence brief** of at most 400 words: key facts tagged `[S#]`, conflicts between
   sources, and what couldn't be confirmed. The brief is saved as a `researcher` turn.
3. **Debate.** Every panelist reads the brief and source list in every phase. That includes the
   openings, which stay blind to each other but not to the evidence. Panelists cite `[S#]` and mark
   unsourced claims as their own knowledge. The consensus judge reads the brief too.
4. **`web_search` tool** (`src/lib/tools/web-search.ts`). In critique and adaptive rounds, panelists whose
   model supports tools can look up one fact per turn. New pages join the registry.
5. **Synthesis.** The secretary cites `[S#]`. Afterwards, the code drops any `[S#]` that isn't in the
   registry and any URL that isn't a registered page. It then appends the Sources section from the
   registry, so the model never writes it.

If research can't run, the debate still runs on the models' own knowledge. That covers a disabled
server, no OpenRouter key, no credits, or every search failing. The session shows a notice (with a link
to add credits when that's the reason), and panelists are told to say plainly what they can't verify.
When the gate says research isn't needed, the panel gets no `web_search` tool either, so that debate
costs nothing extra.

## Limits

| What | Limit |
| --- | --- |
| Research-phase queries | 3 |
| Tool searches per panelist turn | 1 |
| Tool searches per debate (on top of the research phase) | 8 |
| Results per search | 5 |
| Excerpt kept per page | ~1,200 characters |

The per-debate count is read from persisted turns, so Inngest replays never reset it. The limits live
in `src/lib/research/limits.ts`.

## Costs

OpenRouter charges **$0.007 per Exa search** (up to 10 results). It charges this even when the model is
free, on top of token costs. A debate's most expensive case is 11 searches (3 research + 8 tool), plus
the gate, the brief and the summarizing tokens. That comes to about **$0.08** with free or cheap
models and about **$0.10–0.20** with frontier models (`estimateResearchCeilingUsd` in
`src/lib/models/cost-estimate.ts`). Most debates spend much less, and a question that needs no
research spends nothing.

Because the search fee applies to free models too, a panel of free models on an account with no
credit can't research. The new-session form warns about this.

Each search's cost is added to the turn that made it (the research turn, or the panelist's turn).
OpenRouter's reported cost already includes the search fee: a smoke test on 2026-10-09 with
`openai/gpt-4o-mini` reported $0.0075 for $0.0005 of tokens. So the code records OpenRouter's figure as is,
and adds the fee to its own token estimate only when OpenRouter reports no cost.

## Configuration

| Env var | Default | Meaning |
| --- | --- | --- |
| `PARLOIR_WEB_RESEARCH` | on | `0` turns web research off for every debate on the server. |
| `PARLOIR_WEB_ENGINE` | `exa` | OpenRouter web engine: `exa`, `firecrawl`, `parallel` or `native`. Fees differ by engine. |

## Development

- `pnpm dev:mock-openrouter` fakes the web plugin. Each search returns 2 `url_citation` annotations.
  A key containing `freetier` gets 402 (no credits). Questions matching `MOCK_NO_RESEARCH` (default:
  cofounder / hiring) make the gate skip research, and tool-capable models call `web_search` once in
  critique round 1.
- `pnpm smoke:research` (with `PARLOIR_DEV_INHERIT_ENV=1` and a real `OPENROUTER_API_KEY`) runs the gate
  and one real search on a Low cost model (`PARLOIR_SMOKE_MODEL` picks another). It prints the decision,
  the sources and the cost, and checks that OpenRouter's cost still includes the search fee. It costs a
  few cents.

## Research basis

- Lewis et al., *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks* (2020): ground
  generation in retrieved documents.
- Nakano et al., *WebGPT: Browser-assisted question-answering with human feedback* (2021): answers that
  cite the pages they used.
- Asai et al., *Self-RAG* (2023) and Jiang et al., *Active Retrieval Augmented Generation* (2023):
  decide per question whether to retrieve (the gate).
- Yao et al., *ReAct: Synergizing Reasoning and Acting in Language Models* (2023): look things up in the
  middle of reasoning (the critique-round tool).
