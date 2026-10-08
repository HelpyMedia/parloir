/**
 * POST /api/sessions/recommend-panel
 *
 * Given a question, return a full panel preset: title + 2-5 persona IDs +
 * one live-catalog model per persona + depth. All validation happens
 * server-side so the client can apply the result directly. Any
 * unrecoverable failure responds 204 — the caller falls back silently.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/api/csrf";
import { loadProviderContext } from "@/lib/credentials/context";
import { listTemplatePersonas } from "@/lib/personas";
import { pickClassifier } from "@/lib/providers/openrouter-catalog";
import { MODEL_TIERS } from "@/lib/models/tiers";
import { getCatalogWithHealth } from "@/lib/models/catalog";
import { buildShortlist } from "@/lib/recommender/allowed-overrides";
import { recommendPanel } from "@/lib/recommender/panel";
import { RATE_LIMITS, withRateLimit } from "@/lib/rate-limit/token-bucket";

const BodySchema = z.object({
  question: z.string().min(10).max(4000),
  tier: z.enum(MODEL_TIERS).optional(),
  freeOnly: z.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await requireUser();

  const limited = await withRateLimit(
    req,
    "session:recommend-panel",
    RATE_LIMITS.recommendPanel,
    user.id,
    async () => null,
  );
  if (limited instanceof NextResponse) return limited;

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const ctx = await loadProviderContext(user.id);
  if (!ctx.cloud.openrouter) {
    // The recommender picks from the OpenRouter catalog and runs on the
    // user's OpenRouter key; without one there is nothing to suggest.
    return new NextResponse(null, { status: 204 });
  }

  let catalog;
  try {
    catalog = await getCatalogWithHealth();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const { question, freeOnly } = parsed.data;
  const tier = parsed.data.tier ?? (freeOnly ? "free" : "low");
  const shortlist = buildShortlist(catalog, tier);
  const modelChain = pickClassifier(catalog, tier);
  if (shortlist.length < 2 || modelChain.length === 0) {
    return new NextResponse(null, { status: 204 });
  }

  const result = await recommendPanel({
    question: question.trim(),
    personas: await listTemplatePersonas(),
    ctx,
    modelChain,
    shortlist,
  });

  if (result.kind === "no_usable_output") {
    console.warn("recommend-panel: classifier output failed post-filter", { userId: user.id });
  }
  if (result.kind !== "ok") return new NextResponse(null, { status: 204 });

  return NextResponse.json(result.suggestion);
}
