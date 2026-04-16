/**
 * POST /api/sessions/[id]/pause
 *
 * Requests a pause. The orchestrator honors it at the NEXT phase boundary —
 * a turn already in flight finishes naturally. If already paused or already
 * terminal, returns 409.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (
    session.status === "completed" ||
    session.status === "failed" ||
    session.status === "setup"
  ) {
    return NextResponse.json(
      { error: `Cannot pause session in status "${session.status}"` },
      { status: 409 },
    );
  }
  if (session.pauseRequestedAt) {
    return NextResponse.json({ alreadyPaused: true });
  }

  await db
    .update(schema.sessions)
    .set({ pauseRequestedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.sessions.id, sessionId));

  return NextResponse.json({ pauseRequested: true });
}
