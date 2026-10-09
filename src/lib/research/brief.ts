/**
 * The evidence brief: what the research phase found, condensed for the
 * panel, every fact tagged with the registry's [S#] IDs.
 *
 * Written by the judge model, which has no stake in the debate. If no model
 * can write it, the brief is assembled from the per-search summaries so the
 * panel still gets the evidence.
 */

import { generateText } from "ai";
import { resolveModel } from "../providers/registry";
import { attemptSignal } from "../orchestrator/try-generate-object";
import { extractCostUsd } from "../orchestrator/pricing";
import { sanitizeCitations } from "./sources";
import type { ProviderContext, SessionSource } from "../orchestrator/types";

export interface BriefSearch {
  query: string;
  summary: string;
  sources: SessionSource[];
}

export interface Brief {
  text: string;
  modelId: string;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
}

const MAX_WORDS = 400;

export async function writeBrief(params: {
  question: string;
  searches: BriefSearch[];
  modelChain: string[];
  ctx: ProviderContext;
  today: string;
  /** Epoch ms after which no new attempt starts. */
  deadline: number;
}): Promise<Brief> {
  const { question, searches, modelChain, ctx, today, deadline } = params;
  const registry = dedupe(searches.flatMap((s) => s.sources));

  const findings = searches
    .map((s) => {
      const pages = s.sources
        .map((src) => `[${src.id}] ${src.title} — ${src.url}\n${src.excerpt || "(no excerpt)"}`)
        .join("\n\n");
      return `SEARCH: ${s.query}\nSUMMARY: ${s.summary}\nPAGES:\n${pages || "(none)"}`;
    })
    .join("\n\n=====\n\n");

  for (const modelId of modelChain) {
    const signal = attemptSignal(deadline);
    if (!signal) break;
    try {
      const result = await generateText({
        model: ctx.resolveModel ? ctx.resolveModel(modelId) : resolveModel(modelId, ctx),
        temperature: 0.2,
        maxOutputTokens: 1_200,
        maxRetries: 1,
        abortSignal: signal,
        providerOptions: {
          openrouter: { usage: { include: true }, reasoning: { effort: "low", exclude: true } },
        },
        messages: [
          {
            role: "system",
            content:
              `Today's date is ${today}. You write the evidence brief a panel of AI models reads before ` +
              `debating a question. At most ${MAX_WORDS} words, in the language of the QUESTION, in ` +
              "Markdown with three short sections:\n" +
              "1. Key facts: bullets, each ending with the [S#] IDs of the pages that back it.\n" +
              "2. Conflicts: where sources disagree, or 'None found.'\n" +
              "3. Not confirmed: what the question assumes or needs that the results did not confirm " +
              "(for example, no evidence a product with that name exists).\n" +
              "Use only the search findings given. Cite only the [S#] IDs listed. Never invent facts, " +
              "sources or URLs. Do not argue for an answer: the panel debates, you report.",
          },
          { role: "user", content: `QUESTION:\n${question}\n\nSEARCH FINDINGS:\n${findings}` },
        ],
      });
      const text = sanitizeCitations(result.text, registry);
      if (!text) continue;
      const tokensIn = result.usage.inputTokens ?? 0;
      const tokensOut = result.usage.outputTokens ?? 0;
      return {
        text,
        modelId,
        costUsd: extractCostUsd(result.providerMetadata, modelId, tokensIn, tokensOut),
        tokensIn,
        tokensOut,
      };
    } catch (err) {
      console.warn(`[research] brief failed on ${modelId}`, err);
    }
  }

  return { text: fallbackBrief(searches), modelId: "", costUsd: 0, tokensIn: 0, tokensOut: 0 };
}

/** The search summaries themselves, tagged with their sources. */
function fallbackBrief(searches: BriefSearch[]): string {
  const lines = searches.map((s) => {
    const ids = s.sources.map((src) => src.id);
    return `- **${s.query}**: ${s.summary}${ids.length ? ` [${ids.join(", ")}]` : ""}`;
  });
  return lines.join("\n");
}

function dedupe(sources: SessionSource[]): SessionSource[] {
  const seen = new Map<string, SessionSource>();
  for (const s of sources) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()];
}
