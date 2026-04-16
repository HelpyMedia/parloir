/**
 * Tool registry and builder.
 *
 * Tools are Vercel AI SDK tool objects. Each persona declares which tool IDs
 * it can use; buildToolset resolves the IDs and returns the tool map that
 * gets passed to streamText.
 *
 * TODO: wire up the MCP client (@modelcontextprotocol/sdk) so user-configured
 * MCP servers become available as tools. For MVP, ship web_search and rag.
 */

import { tool, type Tool } from "ai";
import { z } from "zod";

// Placeholder web search — swap for Brave/Exa/Tavily integration.
const webSearch = tool({
  description: "Search the web for current information. Returns top 5 results with snippets.",
  inputSchema: z.object({
    query: z.string().min(1).max(400),
  }),
  async execute({ query }) {
    // TODO: plug in Brave Search or Tavily
    return { results: [], note: `stub — search for: ${query}` };
  },
});

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
  web_search: webSearch,
  rag: ragLookup,
};

export async function buildToolset(toolIds: string[], _sessionId: string) {
  const out: Record<string, Tool> = {};
  for (const id of toolIds) {
    if (id in TOOLS) out[id] = TOOLS[id];
    // TODO: resolve MCP-provided tool IDs here, scoped to sessionId
  }
  return out;
}
