/**
 * POST /api/sessions/[id]/start — kick off a debate.
 *
 * This endpoint is INTENTIONALLY fast: it validates the session is ready,
 * emits an Inngest event, and returns. The actual debate runs in the
 * Inngest worker (see src/lib/inngest/debate-workflow.ts). Clients
 * subscribe to /stream to observe progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";

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
  if (session.status !== "setup" && session.status !== "paused") {
    return NextResponse.json(
      { error: `Cannot start session in status "${session.status}"` },
      { status: 409 },
    );
  }

  const participantCount = await db.$count(
    schema.participants,
    eq(schema.participants.sessionId, sessionId),
  );
  if (participantCount < 2) {
    return NextResponse.json(
      { error: "Need at least 2 participants" },
      { status: 400 },
    );
  }

  await inngest.send({
    name: "debate.requested",
    data: { sessionId },
  });

  return NextResponse.json({ status: "queued", sessionId });
}
