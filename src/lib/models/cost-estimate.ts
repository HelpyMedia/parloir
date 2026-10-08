/**
 * Rough cost of one debate, so people see what a tier means before starting.
 *
 * Follows the protocol's shape: blind openings, then critique rounds where
 * every turn reads the transcript so far, a judge check per round and one
 * synthesis. Token sizes are typical, not worst case, and the result is shown
 * as an estimate. Pure, so it runs in the browser too.
 */

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

/** "$0", "< $0.01", "$0.04", "$1.20", "$12". */
export function formatEstimate(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return "< $0.01";
  if (usd < 10) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
