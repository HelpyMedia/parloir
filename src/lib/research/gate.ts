/**
 * Research gate: one cheap structured call that decides whether a question
 * needs live web research, and what to search for.
 *
 * Retrieval helps when the answer depends on facts outside the model's
 * parameters and hurts (cost, distraction) when it doesn't, so retrieval is
 * decided per question rather than always on (Asai et al. 2023, Self-RAG;
 * Jiang et al. 2023, Active Retrieval Augmented Generation). The gate errs
 * toward searching: a search costs under a cent, an unverified claim about
 * a product that doesn't exist costs the whole deliverable.
 */

import { z } from "zod";
import { tryGenerateObject } from "../orchestrator/try-generate-object";
import type { ProviderContext } from "../orchestrator/types";
import { MAX_RESEARCH_QUERIES } from "./limits";

const MAX_QUERY_CHARS = 300;

const GateSchema = z.object({
  needsWeb: z.boolean(),
  reason: z.string().describe("One sentence on why research is or isn't needed."),
  queries: z
    .array(z.string())
    .describe(`At most ${MAX_RESEARCH_QUERIES} short search-engine queries; empty when needsWeb is false.`),
});

export interface GateDecision {
  needsWeb: boolean;
  reason: string;
  queries: string[];
  /** True when no model could decide and we search with the question itself. */
  fallback: boolean;
}

export async function decideResearch(params: {
  question: string;
  context: string;
  modelChain: string[];
  ctx: ProviderContext;
  today: string;
}): Promise<GateDecision> {
  const { question, context, modelChain, ctx, today } = params;

  const result = await tryGenerateObject({
    modelChain,
    ctx,
    schema: GateSchema,
    temperature: 0,
    attemptKind: "classifier",
    deadline: Date.now() + 90_000,
    messages: [
      {
        role: "system",
        content:
          `Today's date is ${today}. You decide whether a panel of AI models needs live web research ` +
          "before it debates a question. The panel's knowledge stops at its training date, which is " +
          "months or years before today, and it cannot browse.\n\n" +
          "Search (needsWeb = true) when the question involves any of: named products, companies, " +
          "people, tools or AI models; prices, laws, regulations or market conditions; recent events " +
          "or the current state of anything; anything that may postdate a model's training; names " +
          "you don't recognize.\n\n" +
          "Don't search (needsWeb = false) for pure reasoning, values, or personal decisions where the " +
          "person supplied the facts, or creative and strategic questions that need no outside facts.\n\n" +
          "When unsure, search: it costs under a cent.\n\n" +
          `If you search, write 1 to ${MAX_RESEARCH_QUERIES} short search-engine queries, each about ` +
          "one fact the panel needs (for example whether a named product exists, what it costs, how " +
          "it compares). Write them in the question's language; English is fine for technical topics.",
      },
      {
        role: "user",
        content: [`QUESTION:\n${question}`, context ? `CONTEXT FROM THE PERSON:\n${context}` : ""]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });

  const questionQuery = question.trim().slice(0, MAX_QUERY_CHARS);
  if (!result) {
    return { needsWeb: true, reason: "The research gate could not decide.", queries: [questionQuery], fallback: true };
  }

  const queries = [
    ...new Set(result.object.queries.map((q) => q.trim().slice(0, MAX_QUERY_CHARS)).filter(Boolean)),
  ].slice(0, MAX_RESEARCH_QUERIES);
  return {
    needsWeb: result.object.needsWeb,
    reason: result.object.reason,
    queries: result.object.needsWeb && queries.length === 0 ? [questionQuery] : queries,
    fallback: false,
  };
}
