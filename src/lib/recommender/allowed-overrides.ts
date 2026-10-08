/**
 * Shortlist of live catalog models the panel recommender may assign.
 *
 * The classifier prompt can't hold the whole catalog (hundreds of models),
 * so we pass the best few per lab — diversity across labs is what the
 * recommender is asked to produce.
 */
import { tierPool, type CatalogModel } from "@/lib/providers/openrouter-catalog";
import type { ModelTier } from "@/lib/models/tiers";

const PER_AUTHOR = 2;
const MAX_MODELS = 30;

export function buildShortlist(catalog: CatalogModel[], tier: ModelTier): CatalogModel[] {
  const perAuthor = new Map<string, number>();
  const out: CatalogModel[] = [];
  for (const m of tierPool(catalog, tier)) {
    const n = perAuthor.get(m.author) ?? 0;
    if (n >= PER_AUTHOR) continue;
    perAuthor.set(m.author, n + 1);
    out.push(m);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}
