/**
 * POST /api/sessions/[id]/resume
 *
 * Sends the debate.resumed Inngest event that the paused workflow is waiting
 * on. The workflow clears the pause flags in its own transaction (see
 * createInngestControlPlane). We do NOT update the sessions row here — that
 * responsibility lives with the worker so there is a single writer for
 * pause/resume state.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { inngest } from "@/lib/inngest/client";

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
  if (!session.pauseRequestedAt) {
    return NextResponse.json(
      { error: "Session is not paused" },
      { status: 409 },
    );
  }

  await inngest.send({
    name: "debate.resumed",
    data: { sessionId },
  });

  return NextResponse.json({ resumed: true });
}
