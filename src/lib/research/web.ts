/**
 * One live web search, run through OpenRouter's web plugin on the user's own
 * OpenRouter key: no extra API key, no direct search-provider integration.
 *
 * The plugin searches with the user message, hands the results to the model
 * and returns them as `url_citation` annotations, which the AI SDK exposes as
 * `source` parts (page excerpt in providerMetadata.openrouter.content). We ask
 * the model for a short, sourced summary and keep the pages themselves for
 * the session's source registry.
 *
 * Never throws: research is an extra, and a debate must run without it.
 *
 *   PARLOIR_WEB_RESEARCH=0   turns web research off entirely (default on)
 *   PARLOIR_WEB_ENGINE       OpenRouter web engine: exa (default), firecrawl,
 *                            parallel or native
 */

import { generateText, type LanguageModel } from "ai";
import { hasOpenRouterKey, resolveOpenRouterModel } from "../providers/registry";
import { extractCostUsd } from "../orchestrator/pricing";
import { describeModelError } from "../orchestrator/model-errors";
import type { ProviderContext } from "../orchestrator/types";
import { sourceKey } from "./sources";
import { WEB_SEARCH_FEE_USD } from "./limits";

const EXCERPT_CHARS = 1_200;
const DEFAULT_TIMEOUT_MS = 60_000;

export function webResearchEnabled(): boolean {
  return process.env.PARLOIR_WEB_RESEARCH !== "0";
}

function webEngine(): string {
  return process.env.PARLOIR_WEB_ENGINE?.trim() || "exa";
}

export interface WebSource {
  url: string;
  title: string;
  excerpt: string;
}

export type WebResearchFailure = "no_credits" | "no_openrouter_key" | "failed";

export type WebResearchResult =
  | {
      ok: true;
      summary: string;
      sources: WebSource[];
      costUsd: number;
      tokensIn: number;
      tokensOut: number;
    }
  | { ok: false; code: WebResearchFailure; message: string };

const SYSTEM_PROMPT =
  "You summarize live web search results for a deliberation panel. In 80 to 150 words, say what " +
  "the results say about the search query: the facts that bear on it, with names, numbers and dates " +
  "where the results give them. If the results do not confirm something the query assumes, say so " +
  'plainly (for example: "no evidence a product called X exists"). Never invent facts, numbers or ' +
  "URLs, and do not fill gaps from memory: only report what the results say. Plain prose, no links, " +
  "no headings. Write in the language of the query.";

export async function webResearch(params: {
  ctx: ProviderContext;
  modelId: string;
  query: string;
  maxResults?: number;
  signal?: AbortSignal;
}): Promise<WebResearchResult> {
  const { ctx, modelId, query, maxResults = 5 } = params;
  if (!hasOpenRouterKey(ctx)) {
    return { ok: false, code: "no_openrouter_key", message: "Web research needs an OpenRouter key." };
  }

  let model: LanguageModel;
  try {
    model = resolveOpenRouterModel(modelId, ctx, {
      plugins: [{ id: "web", engine: webEngine() as never, max_results: maxResults }],
    });
  } catch (err) {
    return { ok: false, code: "failed", message: err instanceof Error ? err.message : String(err) };
  }

  try {
    const result = await generateText({
      model,
      temperature: 0.1,
      maxOutputTokens: 600,
      maxRetries: 1,
      abortSignal: params.signal ?? AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
      // The plugin searches with the user message, so it carries the query alone.
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: query },
      ],
      providerOptions: {
        openrouter: { usage: { include: true }, reasoning: { effort: "low", exclude: true } },
      },
    });

    const sources = collectSources(result.sources);
    const tokensIn = result.usage.inputTokens ?? 0;
    const tokensOut = result.usage.outputTokens ?? 0;
    const tokenCost = extractCostUsd(result.providerMetadata, modelId, tokensIn, tokensOut);
    return {
      ok: true,
      summary: result.text.trim(),
      sources,
      costUsd: withSearchFee(tokenCost),
      tokensIn,
      tokensOut,
    };
  } catch (err) {
    const info = describeModelError(err);
    console.warn("[web-research] search failed", { modelId, code: info.code, err });
    if (info.code === "insufficient_credits") {
      return { ok: false, code: "no_credits", message: info.message };
    }
    return { ok: false, code: "failed", message: info.message };
  }
}

/**
 * OpenRouter's reported cost is per generation. Until the smoke test
 * (scripts/dev/smoke-research.ts) settles whether it already includes the
 * search fee, a cost below the fee can't include it, so add it; a cost at or
 * above the fee is taken as the full charge.
 */
function withSearchFee(reported: number): number {
  return reported >= WEB_SEARCH_FEE_USD ? reported : reported + WEB_SEARCH_FEE_USD;
}

interface SdkSource {
  sourceType: string;
  url?: string;
  title?: string;
  providerMetadata?: unknown;
}

function collectSources(raw: readonly SdkSource[] | undefined): WebSource[] {
  const out: WebSource[] = [];
  const seen = new Set<string>();
  for (const s of raw ?? []) {
    if (s.sourceType !== "url" || !s.url || !/^https?:\/\//i.test(s.url)) continue;
    const key = sourceKey(s.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      url: s.url.trim(),
      title: (s.title ?? "").trim() || hostOf(s.url),
      excerpt: cap(excerptOf(s.providerMetadata), EXCERPT_CHARS),
    });
  }
  return out;
}

function excerptOf(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  const or = (meta as Record<string, unknown>).openrouter;
  if (!or || typeof or !== "object") return "";
  const content = (or as Record<string, unknown>).content;
  return typeof content === "string" ? content.replace(/\s+/g, " ").trim() : "";
}

function cap(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
