/**
 * Rough cost of one debate, so people see what a tier means before starting.
 *
 * Follows the protocol's shape: blind openings, then critique rounds where
 * every turn reads the transcript so far, a judge check per round and one
 * synthesis. Token sizes are typical, not worst case, and the result is shown
 * as an estimate. Pure, so it runs in the browser too.
 */

import { MAX_RESEARCH_QUERIES, TOOL_SEARCHES_PER_SESSION, WEB_SEARCH_FEE_USD } from "@/lib/research/limits";

export interface PricedModel {
  /** USD per million tokens; null for local or unknown models (treated as free). */
  promptPerM: number | null;
  completionPerM: number | null;
}

/** System prompt, persona brief and question. */
const BASE_INPUT = 1_500;
/** A typical panelist turn. */
const TURN_OUTPUT = 700;
const JUDGE_OUTPUT = 800;
const SYNTHESIS_OUTPUT = 2_500;

function cost(m: PricedModel, input: number, output: number): number {
  return ((m.promptPerM ?? 0) * input + (m.completionPerM ?? 0) * output) / 1_000_000;
}

export function estimateDebateCostUsd(panel: PricedModel[], critiqueRounds: number): number {
  if (panel.length === 0) return 0;
  let total = 0;
  let transcript = 0;

  // Openings are blind: nobody reads anyone else.
  for (const m of panel) total += cost(m, BASE_INPUT, TURN_OUTPUT);
  transcript += panel.length * TURN_OUTPUT;

  // The judge is a cheap model and the secretary the strongest seated one;
  // approximate them with the panel's cheapest and priciest.
  const byPrice = [...panel].sort((a, b) => (a.completionPerM ?? 0) - (b.completionPerM ?? 0));
  const judge = byPrice[0];
  const secretary = byPrice[byPrice.length - 1];

  for (let round = 0; round < critiqueRounds; round++) {
    for (const m of panel) {
      total += cost(m, BASE_INPUT + transcript, TURN_OUTPUT);
      transcript += TURN_OUTPUT;
    }
    total += cost(judge, BASE_INPUT + transcript, JUDGE_OUTPUT);
  }

  total += cost(secretary, BASE_INPUT + transcript, SYNTHESIS_OUTPUT);
  return total;
}

// Web research token sizes, per call.
const GATE = { input: 900, output: 200 };
/** The query plus up to 5 injected results, and a short summary. */
const SEARCH = { input: 3_000, output: 250 };
const BRIEF = { input: 7_000, output: 600 };

/**
 * Most a debate can add for web research: the gate, every research query,
 * the brief and every tool search the panel is allowed, at the per-search
 * fee plus tokens. Searches run only when the question needs them, so most
 * debates spend far less (often nothing). Separate from the debate estimate
 * so the UI can show it as "+ up to …".
 */
export function estimateResearchCeilingUsd(panel: PricedModel[]): number {
  if (panel.length === 0) return 0;
  const byPrice = [...panel].sort((a, b) => (a.completionPerM ?? 0) - (b.completionPerM ?? 0));
  const judge = byPrice[0];
  // Tool searches run on the searching panelist's model; assume the priciest.
  const panelist = byPrice[byPrice.length - 1];
  let total = cost(judge, GATE.input, GATE.output) + cost(judge, BRIEF.input, BRIEF.output);
  total += MAX_RESEARCH_QUERIES * (WEB_SEARCH_FEE_USD + cost(judge, SEARCH.input, SEARCH.output));
  total += TOOL_SEARCHES_PER_SESSION * (WEB_SEARCH_FEE_USD + cost(panelist, SEARCH.input, SEARCH.output));
  return total;
}

/** "$0", "< $0.01", "$0.04", "$1.20", "$12". */
export function formatEstimate(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "< $0.01";
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
