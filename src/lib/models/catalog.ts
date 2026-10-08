/**
 * The OpenRouter catalog annotated with Parloir's model health. Server-only:
 * every automatic picker (default panels, suggestions, judge/secretary) reads
 * this so a model OpenRouter refused is never seated by default.
 */
import { applyHealth, getCatalog, type CatalogModel } from "@/lib/providers/openrouter-catalog";
import { loadModelHealth } from "./health";

export async function getCatalogWithHealth(): Promise<CatalogModel[]> {
  const [catalog, health] = await Promise.all([getCatalog(), loadModelHealth()]);
  return applyHealth(catalog, health);
}
