/**
 * Free models share capacity with everyone on OpenRouter, so a free seat
 * that stops answering is usually busy, not broken. Before pausing to ask
 * the person, swap it for another reliable free model and redo the turn.
 * Paid seats still pause: the person chose, and pays for, that model.
 *
 * Every swap is decided and saved inside one durable step; the in-memory
 * session is updated from the step's result, so replays see the same seats.
 */
import { loadPersona } from "../personas";
import { tierPool, type CatalogModel } from "../providers/openrouter-catalog";
import { participantModelId, type TurnOutcome } from "./turn";
import type { ModelErrorCode } from "./model-errors";
import type { DebateDeps } from "./protocol";
import type { Session } from "./types";

/** Swaps per turn before falling back to pausing for the person. */
export const MAX_FREE_SWAPS = 2;

type Failed = Extract<TurnOutcome, { ok: false }>;

/**
 * Failures another free model can get past. A flagged prompt fails on any
 * model, and key or credit problems belong to the account.
 */
const SWAPPABLE = new Set<ModelErrorCode>([
  "rate_limited",
  "provider_overloaded",
  "model_unavailable",
  "model_restricted",
  "timeout",
  "empty_response",
  "context_too_long",
  "unknown",
]);

export function swappable(o: TurnOutcome): o is Failed {
  return !o.ok && SWAPPABLE.has(o.code);
}

export interface FreeSwap {
  personaId: string;
  from: string;
  to: string;
}

/**
 * Give each failed free seat another reliable free model nobody on the panel
 * uses and the seat hasn't tried yet. `tried` records, per seat, the models
 * it has already used in this turn; callers keep one map per turn.
 */
export async function swapFailedFreeSeats(
  session: Session,
  failed: Failed[],
  key: string,
  deps: DebateDeps,
  tried: Map<string, Set<string>>,
): Promise<FreeSwap[]> {
  const { storage, sink, durable } = deps;
  const swaps = await durable.step(`freeswap:${key}`, async () => {
    const out: FreeSwap[] = [];
    const candidates = failed.filter(swappable);
    if (candidates.length === 0) return out;

    let catalog: CatalogModel[];
    try {
      catalog = await storage.loadCatalog();
    } catch (err) {
      console.warn("[free-swap] catalog unavailable", err);
      return out;
    }
    const byId = new Map(catalog.map((m) => [m.id, m]));
    const seated = new Set(Object.values(session.participantModelOverrides ?? {}));
    // Reliable first (tierPool already drops models that keep failing).
    const pool = tierPool(catalog, "free").filter((m) => m.reliability !== "flaky");

    for (const f of candidates) {
      const persona = await loadPersona(f.personaId);
      const from = participantModelId(session, persona);
      // The catalog is cached for an hour, so a model can be missing from it;
      // OpenRouter's ":free" suffix still marks a free one.
      const current = byId.get(from);
      const isFree = current ? current.isFree : from.endsWith(":free");
      if (!isFree) continue;
      const author = current?.author ?? from.replace(/^openrouter\//, "").split("/")[0];
      const seen = tried.get(f.personaId) ?? new Set([from]);
      const options = pool.filter((m) => !seated.has(m.id) && !seen.has(m.id));
      // Another lab's model is less likely to share the same busy upstream.
      const to = options.find((m) => m.author !== author) ?? options[0];
      if (!to) continue;

      await storage.setSeatModel(session.id, f.personaId, to.id);
      seated.add(to.id);
      out.push({ personaId: f.personaId, from, to: to.id });
      await sink.emit({
        type: "model_switched",
        personaId: f.personaId,
        personaName: persona.name,
        fromModel: from,
        toModel: to.id,
        code: f.code,
      });
    }
    return out;
  });

  for (const s of swaps) {
    session.participantModelOverrides = { ...session.participantModelOverrides, [s.personaId]: s.to };
    const seen = tried.get(s.personaId) ?? new Set<string>();
    seen.add(s.from);
    seen.add(s.to);
    tried.set(s.personaId, seen);
  }
  return swaps;
}
