/**
 * The web_search tool panelists get in critique and adaptive rounds.
 *
 * The shared research phase covers what the question obviously needs; a
 * debate surfaces new factual disputes, and letting a model look one up
 * mid-argument (Yao et al. 2023, ReAct: interleaving reasoning with tool
 * calls) settles them with evidence instead of assertion. Openings get no
 * tool: they already have the brief, and the parallel phase stays fast.
 *
 * Limits keep cost bounded: one search per turn and a fixed number per
 * session on top of the research phase. The session count is read from
 * persisted turns, never kept in memory, so an Inngest replay can't reset it.
 */

import { tool } from "ai";
import { z } from "zod";
import { pickJudgeModelChain } from "../providers/defaults";
import { firstOpenRouterModel } from "../providers/registry";
import { webResearch } from "../research/web";
import { SEARCHES_PER_TURN, TOOL_SEARCHES_PER_SESSION } from "../research/limits";
import type { Storage, StreamSink } from "../orchestrator/protocol";
import type { Phase, ProviderContext, Session, ToolCall } from "../orchestrator/types";

export const WEB_SEARCH_TOOL = "web_search";
const SEARCH_TIMEOUT_MS = 45_000;

export interface WebSearchContext {
  session: Session;
  ctx: ProviderContext;
  phase: Phase;
  roundNumber: number;
  personaId: string;
  /** The searching panelist's model; searches run on it when OpenRouter can. */
  modelId: string;
  turnId: string;
  storage: Storage;
  sink: StreamSink;
}

/** What a turn's tools did, for the persisted turn. */
export interface ToolRecorder {
  calls: ToolCall[];
  costUsd: number;
}

type SearchResult =
  | { summary: string; sources: Array<{ id: string; title: string; url: string }> }
  | { error: string };

export function webSearchTool(c: WebSearchContext, recorder: ToolRecorder) {
  let attempts = 0;

  async function search(query: string, abortSignal: AbortSignal | undefined): Promise<SearchResult> {
    if (attempts >= SEARCHES_PER_TURN) {
      return { error: "Search limit for this turn reached. Argue from the evidence brief." };
    }
    attempts++;
    if ((await c.storage.countToolSearches(c.session.id)) >= TOOL_SEARCHES_PER_SESSION) {
      return { error: "Search limit reached for this debate. Argue from the evidence brief." };
    }
    // Local models can't run OpenRouter's web plugin; the judge searches for them.
    const modelId = firstOpenRouterModel([c.modelId, ...pickJudgeModelChain(c.session.protocol.judgeModel, c.ctx, [])]);
    if (!modelId) return { error: "Web search unavailable. Argue from the brief and your own knowledge." };

    const timeout = AbortSignal.timeout(SEARCH_TIMEOUT_MS);
    const r = await webResearch({
      ctx: c.ctx,
      modelId,
      query,
      signal: abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout,
    });
    if (!r.ok) {
      return {
        error:
          r.code === "no_credits"
            ? "Web search unavailable: the OpenRouter account has no credits. Argue from the brief and your own knowledge, and say what you could not verify."
            : "Web search unavailable right now. Argue from the brief and your own knowledge, and say what you could not verify.",
      };
    }
    recorder.costUsd += r.costUsd;
    const registered = await c.storage.appendSources(
      c.session.id,
      r.sources.map((s) => ({ ...s, foundBy: c.personaId, phase: c.phase, round: c.roundNumber })),
    );
    return { summary: r.summary, sources: registered.map(({ id, title, url }) => ({ id, title, url })) };
  }

  return tool({
    description:
      "Search the live web to verify a specific fact that matters to your argument, or to fill a gap " +
      "in the evidence brief. Do not search for things the brief already covers. One search per turn. " +
      "Returns a short summary and sources; cite them as [S#].",
    inputSchema: z.object({
      query: z.string().min(1).max(300).describe("A short search-engine query about one fact."),
    }),
    async execute({ query }, { abortSignal, toolCallId }) {
      const started = Date.now();
      await c.sink.emit({ type: "tool_call", turnId: c.turnId, toolName: WEB_SEARCH_TOOL, args: { query } });
      let result: SearchResult;
      try {
        result = await search(query, abortSignal);
      } catch (err) {
        // A DB blip must not cost the panelist their turn.
        console.warn("[web_search] failed", { sessionId: c.session.id, err });
        result = { error: "Web search unavailable right now. Argue from the evidence brief." };
      }
      recorder.calls.push({
        id: toolCallId,
        toolName: WEB_SEARCH_TOOL,
        args: { query },
        result,
        durationMs: Date.now() - started,
      });
      await c.sink.emit({ type: "tool_result", turnId: c.turnId, toolName: WEB_SEARCH_TOOL, result });
      return result;
    },
  });
}
