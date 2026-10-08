/**
 * PUT    /api/sessions/[id]/seats/[personaId]  { modelId }  switch a panelist's model
 * DELETE /api/sessions/[id]/seats/[personaId]               take a panelist off the panel
 *
 * Only while the debate is paused: the orchestrator re-reads the panel when
 * it resumes (pause.ts / model-fix.ts), so a change made mid-turn would be
 * ignored or, worse, half-applied.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/api/csrf";
import { isAllowedModelId } from "@/lib/config/edition";
import { getCatalogWithHealth } from "@/lib/models/catalog";

/** A debate needs at least two voices. */
const MIN_PANEL = 2;

type Params = { params: Promise<{ id: string; personaId: string }> };

async function loadPausedSeat(req: NextRequest, { params }: Params) {
  const csrf = assertSameOrigin(req);
  if (csrf) return { error: csrf };
  const user = await requireUser();
  const { id: sessionId, personaId } = await params;

  const session = await db.query.sessions.findFirst({ where: eq(schema.sessions.id, sessionId) });
  if (!session) return { error: NextResponse.json({ error: "Session not found" }, { status: 404 }) };
  if (session.createdBy !== user.id) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (session.status !== "paused") {
    return { error: NextResponse.json({ error: "Pause the debate first.", code: "not_paused" }, { status: 409 }) };
  }
  const seats = await db.query.participants.findMany({ where: eq(schema.participants.sessionId, sessionId) });
  const seat = seats.find((s) => s.personaId === personaId);
  if (!seat || seat.removed) {
    return { error: NextResponse.json({ error: "Panelist not found" }, { status: 404 }) };
  }
  return { session, seats, sessionId, personaId };
}

const PutBody = z.object({ modelId: z.string().min(3).max(200) });

export async function PUT(req: NextRequest, ctx: Params) {
  const loaded = await loadPausedSeat(req, ctx);
  if ("error" in loaded) return loaded.error;
  const { session, sessionId, personaId } = loaded;

  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "modelId is required" }, { status: 400 });
  const { modelId } = parsed.data;
  if (!isAllowedModelId(modelId)) {
    return NextResponse.json({ error: "This model isn't available here.", code: "model_not_allowed" }, { status: 400 });
  }
  if (modelId.startsWith("openrouter/")) {
    // Same rules as the picker: listed by OpenRouter and not refused to Parloir.
    const catalog = await getCatalogWithHealth().catch(() => null);
    const entry = catalog?.find((m) => m.id === modelId);
    if (catalog && (!entry || entry.restricted)) {
      return NextResponse.json({ error: "This model can't be used right now.", code: "model_restricted" }, { status: 400 });
    }
  }

  await db
    .update(schema.sessions)
    .set({
      participantModelOverrides: { ...(session.participantModelOverrides ?? {}), [personaId]: modelId },
      updatedAt: new Date(),
    })
    .where(eq(schema.sessions.id, sessionId));
  return NextResponse.json({ personaId, modelId });
}

export async function DELETE(req: NextRequest, ctx: Params) {
  const loaded = await loadPausedSeat(req, ctx);
  if ("error" in loaded) return loaded.error;
  const { seats, sessionId, personaId } = loaded;

  const remaining = seats.filter((s) => !s.removed && s.personaId !== personaId).length;
  if (remaining < MIN_PANEL) {
    return NextResponse.json(
      { error: "A debate needs at least two panelists.", code: "min_panel" },
      { status: 409 },
    );
  }
  await db
    .update(schema.participants)
    .set({ removed: true })
    .where(and(eq(schema.participants.sessionId, sessionId), eq(schema.participants.personaId, personaId)));
  return NextResponse.json({ personaId, removed: true });
}
