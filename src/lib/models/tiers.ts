/**
 * Model tiers people pick from instead of hunting through hundreds of models.
 * Defined by live prices (and, when ranking, OpenRouter's intelligence index),
 * never by model id, so they keep working as the catalog changes. Pure: the
 * new-session form imports it too.
 */
export const MODEL_TIERS = ["free", "low", "medium", "high"] as const;
export type ModelTier = (typeof MODEL_TIERS)[number];

/** Price ceilings in USD per million tokens. "high" has none. */
export const TIER_PRICE_MAX = {
  low: { promptPerM: 0.75, completionPerM: 3 },
  medium: { promptPerM: 3, completionPerM: 12 },
} as const;

interface Priced {
  isFree: boolean;
  promptPerM: number | null;
  completionPerM: number | null;
}

function within(m: Priced, max: { promptPerM: number; completionPerM: number }): boolean {
  return (m.promptPerM ?? 0) <= max.promptPerM && (m.completionPerM ?? 0) <= max.completionPerM;
}

/** Whether a model may be seated by default in a tier. */
export function inTier(m: Priced, tier: ModelTier): boolean {
  if (tier === "free") return m.isFree;
  if (m.isFree) return false;
  if (tier === "high") return true;
  return within(m, TIER_PRICE_MAX[tier]);
}

/** The cheapest tier a model belongs to. */
export function tierOf(m: Priced): ModelTier {
  if (m.isFree) return "free";
  if (within(m, TIER_PRICE_MAX.low)) return "low";
  if (within(m, TIER_PRICE_MAX.medium)) return "medium";
  return "high";
}
