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
import { requireUser } from "@/lib/auth/server";
import { loadProviderContext } from "@/lib/credentials/context";
import { listTemplatePersonas } from "@/lib/personas";
import { pickClassifierModelChain } from "@/lib/providers/defaults";
import { buildAllowedOverrides } from "@/lib/recommender/allowed-overrides";
import { recommendPanel } from "@/lib/recommender/panel";

export async function POST(req: NextRequest) {
  const user = await requireUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const question =
    typeof body === "object" && body !== null && "question" in body
      ? (body as { question: unknown }).question
      : undefined;
  if (typeof question !== "string") {
    return NextResponse.json({ error: "question required" }, { status: 400 });
  }
  const trimmed = question.trim();
  if (trimmed.length < 10 || trimmed.length > 4000) {
    return NextResponse.json(
      { error: "question must be 10-4000 characters" },
      { status: 400 },
    );
  }

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

  const suggestion = await recommendPanel({
    question: trimmed,
    personas,
    ctx,
    modelChain,
    allowedOverrides,
  });

  if (!suggestion) {
    console.warn("recommend-panel: classifier produced no usable output", {
      userId: user.id,
    });
    return new NextResponse(null, { status: 204 });
  }

  return NextResponse.json(suggestion);
}
