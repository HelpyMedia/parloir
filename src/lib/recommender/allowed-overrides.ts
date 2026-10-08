/**
 * Shortlist of live catalog models the panel recommender may assign.
 *
 * The classifier prompt can't hold the whole catalog (hundreds of models),
 * so we pass the best few per lab — diversity across labs is what the
 * recommender is asked to produce.
 */
import { byQuality, type CatalogModel } from "@/lib/providers/openrouter-catalog";

const PER_AUTHOR = 2;
const MAX_MODELS = 30;

export function buildShortlist(catalog: CatalogModel[], freeOnly: boolean): CatalogModel[] {
  const perAuthor = new Map<string, number>();
  const out: CatalogModel[] = [];
  const pool = catalog
    .filter((m) => m.contextLength >= 32_000 && (!freeOnly || m.isFree))
    .sort(byQuality);
  for (const m of pool) {
    const n = perAuthor.get(m.author) ?? 0;
    if (n >= PER_AUTHOR) continue;
    perAuthor.set(m.author, n + 1);
    out.push(m);
    if (out.length >= MAX_MODELS) break;
  }
  return out;
}
