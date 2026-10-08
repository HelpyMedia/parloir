/**
 * Server-side completion of a session's model choices.
 *
 * The form normally sends a model for every panelist. Anything missing is
 * filled from the live catalog (so an API client can omit models entirely),
 * and an automatic judge/secretary ("" in the protocol) is resolved to a
 * concrete model now, so the debate itself never depends on the catalog
 * being reachable.
 */

import {
  pickDefaultPanel,
  pickJudge,
  pickSecretary,
  type CatalogModel,
} from "@/lib/providers/openrouter-catalog";
import { getCatalogWithHealth } from "@/lib/models/catalog";
import type { ModelTier } from "@/lib/models/tiers";

export interface ModelPicks {
  overrides: Record<string, string>;
  judgeModel: string;
  synthesizerModel: string;
}

export class MissingModelError extends Error {
  constructor(readonly personaId: string) {
    super(`Pick a model for panelist "${personaId}".`);
    this.name = "MissingModelError";
  }
}

export async function completeModelPicks(params: {
  personaIds: string[];
  overrides: Record<string, string>;
  judgeModel: string;
  synthesizerModel: string;
  tier: ModelTier;
  openRouterAvailable: boolean;
}): Promise<ModelPicks> {
  const overrides = { ...params.overrides };
  const missing = params.personaIds.filter((id) => !overrides[id]);
  const needsCatalog =
    params.openRouterAvailable &&
    (missing.length > 0 || !params.judgeModel || !params.synthesizerModel);

  let catalog: CatalogModel[] | null = null;
  if (needsCatalog) {
    try {
      catalog = await getCatalogWithHealth();
    } catch (err) {
      console.warn("[model-picks] catalog unavailable", err);
    }
  }

  if (missing.length > 0) {
    if (!catalog) throw new MissingModelError(missing[0]);
    const used = new Set(Object.values(overrides));
    const pool = pickDefaultPanel(catalog, 10, { tier: params.tier }).filter(
      (id) => !used.has(id),
    );
    for (const personaId of missing) {
      const next = pool.shift();
      if (!next) throw new MissingModelError(personaId);
      overrides[personaId] = next;
    }
  }

  const panel = params.personaIds.map((id) => overrides[id]);
  const judgeModel = params.judgeModel || (catalog ? pickJudge(catalog, panel) : null) || "";
  const synthesizerModel =
    params.synthesizerModel || (catalog ? pickSecretary(catalog, panel) : null) || "";

  return { overrides, judgeModel, synthesizerModel };
}
