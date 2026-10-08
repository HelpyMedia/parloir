/**
 * POST /api/sessions/[id]/resume
 *
 * Clears the pause flag, then sends the `debate.resumed` event the paused
 * workflow waits on. The flag is the source of truth: the workflow re-checks
 * it after every wait, so a resume that lands before the workflow started
 * waiting is never lost (the event only wakes it up sooner). Resuming before
 * the debate reached a pause point simply cancels the pending pause.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/api/csrf";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await requireUser();
  const { id: sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.createdBy !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!session.pauseRequestedAt) {
    return NextResponse.json({ error: "Session is not paused" }, { status: 409 });
  }

  await db
    .update(schema.sessions)
    .set({ pauseRequestedAt: null, updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));

  await inngest.send({ name: "debate.resumed", data: { sessionId } });

  return NextResponse.json({ resumed: true });
}
