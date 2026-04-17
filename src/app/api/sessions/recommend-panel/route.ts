/**
 * POST /api/sessions/recommend-panel
 *
 * Given a question, return a full panel preset: title + 2-5 persona IDs +
 * per-persona model overrides + depth. All validation, allowlisting, and
 * prefix normalization happens server-side so the client can apply the
 * result directly without extra checks. Any unrecoverable failure responds
 * 204 — the caller is expected to fall back silently.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { loadProviderContext } from "@/lib/credentials/context";
import { listTemplatePersonas } from "@/lib/personas";
import { pickClassifierModelChain } from "@/lib/providers/defaults";
import { buildAllowedOverrides } from "@/lib/recommender/allowed-overrides";
import { recommendPanel } from "@/lib/recommender/panel";

const BodySchema = z.object({
  question: z.string().min(10).max(4000),
});

export async function POST(req: NextRequest) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const trimmed = parsed.data.question.trim();

  const ctx = await loadProviderContext(user.id);
  const modelChain = pickClassifierModelChain(ctx);
  if (modelChain.length === 0) {
    console.warn("recommend-panel: empty classifier chain", {
      userId: user.id,
    });
    return new NextResponse(null, { status: 204 });
  }

  const personas = await listTemplatePersonas();
  const allowedOverrides = buildAllowedOverrides(ctx);

  const result = await recommendPanel({
    question: trimmed,
    personas,
    ctx,
    modelChain,
    allowedOverrides,
  });

  // "llm_failed" is already logged by tryGenerateObject with the full per-
  // model error list — don't double-warn. "no_usable_output" is our own
  // post-filter rejection and merits its own log line so operators can
  // distinguish LLM infra failures from validation/filtering rejections.
  if (result.kind === "no_usable_output") {
    console.warn("recommend-panel: classifier output failed post-filter", {
      userId: user.id,
    });
  }

  if (result.kind !== "ok") {
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(result.suggestion);
}
