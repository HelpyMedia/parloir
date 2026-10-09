/**
 * Tool registry and builder.
 *
 * Tools are Vercel AI SDK tool objects. Each persona declares which tool IDs
 * it can use; buildToolset resolves the IDs and returns the tool map that
 * gets passed to streamText, plus a recorder of what the tools did.
 *
 * web_search is not a persona tool: it is attached automatically in critique
 * and adaptive rounds when web research can run (see web-search.ts).
 *
 * TODO: wire up the MCP client (@modelcontextprotocol/sdk) so user-configured
 * MCP servers become available as tools.
 */

import { tool, type Tool } from "ai";
import { z } from "zod";
import { modelSupportsTools } from "../providers/openrouter-catalog";
import { hasOpenRouterKey } from "../providers/registry";
import { webResearchEnabled } from "../research/web";
import { WEB_SEARCH_TOOL, webSearchTool, type ToolRecorder, type WebSearchContext } from "./web-search";
import type { ResearchOutcome } from "../orchestrator/types";

const ragLookup = tool({
  description: "Search the session's attached documents for relevant passages.",
  inputSchema: z.object({
    query: z.string().min(1).max(400),
    topK: z.number().int().min(1).max(20).default(5),
  }),
  async execute({ query, topK }) {
    // TODO: pgvector similarity search scoped to sessionId
    return { passages: [], note: `stub — rag lookup: ${query} (top ${topK})` };
  },
});

const TOOLS: Record<string, Tool> = {
  rag: ragLookup,
};

export interface ToolsetContext extends WebSearchContext {
  research?: ResearchOutcome;
}

/**
 * No tool when research was skipped because a search would fail the same
 * way (off, no credits, no key), or because the gate judged the question
 * needs no outside facts: that call holds for the whole debate, so a
 * question about the person's own situation never pays for a search.
 */
const NO_SEARCH_AFTER_SKIP = new Set(["disabled", "no_credits", "no_openrouter_key", "not_needed"]);

async function webSearchAvailable(c: ToolsetContext): Promise<boolean> {
  if (c.phase !== "critique" && c.phase !== "adaptive_round") return false;
  if (!webResearchEnabled() || !hasOpenRouterKey(c.ctx)) return false;
  if (c.research?.status === "skipped" && NO_SEARCH_AFTER_SKIP.has(c.research.reason)) return false;
  return modelSupportsTools(c.modelId);
}

export async function buildToolset(
  toolIds: string[],
  c: ToolsetContext,
): Promise<{ tools: Record<string, Tool>; recorder: ToolRecorder }> {
  const recorder: ToolRecorder = { calls: [], costUsd: 0 };
  const tools: Record<string, Tool> = {};
  for (const id of toolIds) {
    if (id in TOOLS) tools[id] = TOOLS[id];
    // TODO: resolve MCP-provided tool IDs here, scoped to the session
  }
  if (await webSearchAvailable(c)) tools[WEB_SEARCH_TOOL] = webSearchTool(c, recorder);
  return { tools, recorder };
}
