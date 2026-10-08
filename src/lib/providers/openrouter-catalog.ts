import { inTier, type ModelTier } from "@/lib/models/tiers";

/**
 * Live OpenRouter model catalog.
 *
 * Nothing in Parloir pins a model ID: pickers, the default panel, the judge
 * and the secretary are all chosen from this list at run time, so models
 * appear and retire without a code change.
 *
 * The public /api/v1/models endpoint needs no key. We cache it per process
 * for an hour and serve the stale copy if OpenRouter is briefly unreachable.
 */

function catalogUrl(): string {
  const base = openRouterApiBase();
  return `${base.replace(/\/+$/, "")}/models`;
}
const TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;

/** OpenRouter's API root, or a compatible proxy / the local mock in development. */
export function openRouterApiBase(): string {
  return (process.env.PARLOIR_OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
}

export interface CatalogModel {
  /** Parloir model ID, always `openrouter/<slug>`. */
  id: string;
  /** OpenRouter slug, e.g. `anthropic/claude-sonnet-4.6` or `x/y:free`. */
  slug: string;
  name: string;
  /** Model author, first segment of the slug. */
  author: string;
  description: string;
  contextLength: number;
  /** USD per million tokens. */
  promptPerM: number;
  completionPerM: number;
  isFree: boolean;
  /** Supports JSON-schema structured output (judge/secretary friendly). */
  structured: boolean;
  /** Artificial Analysis intelligence index when OpenRouter reports one. */
  intelligence: number | null;
  /** Unix seconds. */
  created: number;
  /** OpenRouter refused this model to Parloir recently (see src/lib/models/health.ts). */
  restricted?: boolean;
  /** How reliably it has answered in Parloir debates lately. */
  reliability?: "good" | "unknown" | "flaky";
}

interface RawModel {
  id: string;
  name?: string;
  description?: string;
  created?: number;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
  expiration_date?: string | null;
  benchmarks?: { artificial_analysis?: { intelligence_index?: number | null } };
}

let cache: { at: number; models: CatalogModel[] } | null = null;
let inflight: Promise<CatalogModel[]> | null = null;

function perMillion(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null; // routers report -1
  return Math.round(n * 1_000_000 * 1000) / 1000;
}

export function normalizeCatalog(raw: RawModel[], now = Date.now()): CatalogModel[] {
  const out: CatalogModel[] = [];
  for (const m of raw) {
    if (!m?.id || typeof m.id !== "string") continue;
    const inputs = m.architecture?.input_modalities ?? ["text"];
    const outputs = m.architecture?.output_modalities ?? ["text"];
    if (!inputs.includes("text") || !outputs.includes("text")) continue;
    if (m.expiration_date && Date.parse(m.expiration_date) < now) continue;

    const promptPerM = perMillion(m.pricing?.prompt);
    const completionPerM = perMillion(m.pricing?.completion);
    if (promptPerM === null || completionPerM === null) continue;

    const params = m.supported_parameters ?? [];
    const intelligence = m.benchmarks?.artificial_analysis?.intelligence_index;
    out.push({
      id: `openrouter/${m.id}`,
      slug: m.id,
      name: m.name ?? m.id,
      author: m.id.split("/")[0] ?? "",
      description: (m.description ?? "").slice(0, 280),
      contextLength: m.context_length ?? 0,
      promptPerM,
      completionPerM,
      isFree: (promptPerM === 0 && completionPerM === 0) || m.id.endsWith(":free"),
      structured: params.includes("structured_outputs") || params.includes("response_format"),
      intelligence: typeof intelligence === "number" ? intelligence : null,
      created: m.created ?? 0,
    });
  }
  return out;
}

async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await fetch(catalogUrl(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`openrouter catalog ${res.status}`);
  const body = (await res.json()) as { data?: RawModel[] };
  const models = normalizeCatalog(body.data ?? []);
  if (models.length === 0) throw new Error("openrouter catalog empty");
  return models;
}

/** The catalog, cached for an hour. Throws only if it has never loaded. */
export async function getCatalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;
  inflight ??= fetchCatalog()
    .then((models) => {
      cache = { at: Date.now(), models };
      return models;
    })
    .catch((err) => {
      if (cache) {
        console.warn("[catalog] refresh failed, serving stale copy", err);
        return cache.models;
      }
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Test hook. */
export function primeCatalog(models: CatalogModel[]) {
  cache = { at: Date.now(), models };
}

// ─── Ranking and automatic picks ────────────────────────────────────────────

/** Best first: benchmarked intelligence, then recency. */
export function byQuality(a: CatalogModel, b: CatalogModel): number {
  const ai = a.intelligence ?? -1;
  const bi = b.intelligence ?? -1;
  if (ai !== bi) return bi - ai;
  return b.created - a.created;
}

const RELIABILITY_RANK = { good: 0, unknown: 1, flaky: 2 } as const;

/** Models that have answered reliably first, then by quality. */
export function byReliabilityThenQuality(a: CatalogModel, b: CatalogModel): number {
  const ra = RELIABILITY_RANK[a.reliability ?? "unknown"];
  const rb = RELIABILITY_RANK[b.reliability ?? "unknown"];
  return ra !== rb ? ra - rb : byQuality(a, b);
}

/** Copies of the catalog entries with what Parloir has seen each model do. */
export function applyHealth(
  catalog: CatalogModel[],
  health: Map<string, { restricted: boolean; reliability: "good" | "unknown" | "flaky" }>,
): CatalogModel[] {
  if (health.size === 0) return catalog;
  return catalog.map((m) => {
    const h = health.get(m.id);
    return h ? { ...m, restricted: h.restricted, reliability: h.reliability } : m;
  });
}

/** Usable for a multi-turn debate: enough context to hold a transcript. */
function debateCapable(m: CatalogModel): boolean {
  return m.contextLength >= 32_000;
}

/**
 * Paid tiers rank by quality and only push flaky models down: paid models
 * are reliable, and ranking a cheap "good" model above a frontier one would
 * defeat the point of the High tier. Free models share capacity, so there
 * reliability comes first.
 */
function tierOrder(tier: ModelTier): (a: CatalogModel, b: CatalogModel) => number {
  if (tier === "free") return byReliabilityThenQuality;
  return (a, b) =>
    Number(a.reliability === "flaky") - Number(b.reliability === "flaky") || byQuality(a, b);
}

/** Models a tier draws from, best first. */
export function tierPool(catalog: CatalogModel[], tier: ModelTier): CatalogModel[] {
  return catalog.filter((m) => debateCapable(m) && !m.restricted && inTier(m, tier)).sort(tierOrder(tier));
}

/**
 * A default panel of `count` models. Different authors on purpose: model
 * diversity is what makes multi-agent debate beat a single model (Du et al.
 * 2023; Liang et al. 2023), so we never seat two models from one lab when
 * we can avoid it. If a tier has too few models, cheaper tiers fill the
 * remaining seats.
 */
export function pickDefaultPanel(
  catalog: CatalogModel[],
  count: number,
  opts: { tier: ModelTier },
): string[] {
  const primary = tierPool(catalog, opts.tier);
  // Short on models: step down to cheaper tiers, never up, so a tier never
  // seats something pricier than its name promises.
  const cheaper: Record<ModelTier, ModelTier[]> = {
    free: [],
    low: ["free"],
    medium: ["low", "free"],
    high: ["medium", "low", "free"],
  };
  const backup = cheaper[opts.tier].flatMap((t) => tierPool(catalog, t));
  const picked: CatalogModel[] = [];
  const authors = new Set<string>();
  for (const m of primary) {
    if (picked.length >= count) break;
    if (authors.has(m.author)) continue;
    authors.add(m.author);
    picked.push(m);
  }
  // Not enough distinct labs: fill with the next best regardless of lab.
  for (const m of [...primary, ...backup]) {
    if (picked.length >= count) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.map((m) => m.id);
}

/**
 * Judge: structured-output capable, cheap, and — when possible — not one of
 * the debaters, so it has no stake in the positions it ranks.
 */
export function pickJudge(catalog: CatalogModel[], panel: string[]): string | null {
  const freeOnly = panel.every((id) => catalog.find((m) => m.id === id)?.isFree ?? false);
  const candidates = catalog
    .filter((m) => m.structured && debateCapable(m) && !m.restricted)
    // A paid debate gets a paid judge: a free one would bring back the rate
    // limits the person paid to avoid.
    .filter((m) => (freeOnly ? m.isFree : !m.isFree && m.completionPerM <= 5))
    .sort(freeOnly ? byReliabilityThenQuality : tierOrder("low"));
  return (candidates.find((m) => !panel.includes(m.id)) ?? candidates[0])?.id ?? null;
}

/** Secretary: the strongest model already on the panel, preferring structured output. */
export function pickSecretary(catalog: CatalogModel[], panel: string[]): string | null {
  const seated = panel
    .map((id) => catalog.find((m) => m.id === id))
    .filter((m): m is CatalogModel => Boolean(m))
    .sort(
      (a, b) =>
        Number(Boolean(a.restricted)) - Number(Boolean(b.restricted)) ||
        Number(b.structured) - Number(a.structured) ||
        byQuality(a, b),
    );
  return seated[0]?.id ?? panel[0] ?? null;
}

/** Cheap structured-capable model for the panel recommender. */
export function pickClassifier(catalog: CatalogModel[], tier: ModelTier): string[] {
  const freeOnly = tier === "free";
  return catalog
    .filter((m) => m.structured && !m.restricted && (freeOnly ? m.isFree : !m.isFree && m.completionPerM <= 5))
    .sort(freeOnly ? byReliabilityThenQuality : tierOrder("low"))
    .slice(0, 3)
    .map((m) => m.id);
}
