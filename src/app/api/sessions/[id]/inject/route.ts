/**
 * POST /api/sessions/[id]/inject
 *
 * Queues a human note for the next phase boundary. Accepted regardless of
 * whether the session is currently paused — the orchestrator drains the
 * queue between every phase. If the debate has already completed or failed,
 * return 409.
 *
 * Auth: unwired (CLAUDE.md). We use sessions.createdBy as the author.
 */

import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const body = (await req.json().catch(() => null)) as
    | { content?: unknown }
    | null;
  const content =
    typeof body?.content === "string" ? body.content.trim() : "";

  if (!content) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }
  if (content.length > 4000) {
    return NextResponse.json(
      { error: "content exceeds 4000 chars" },
      { status: 400 },
    );
  }

  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status === "completed" || session.status === "failed") {
    return NextResponse.json(
      { error: `Cannot inject into session in status "${session.status}"` },
      { status: 409 },
    );
  }

  const authorId = session.createdBy;
  const authorRow = await db.query.users.findFirst({
    where: eq(schema.users.id, authorId),
    columns: { name: true, email: true },
  });
  const authorName = authorRow?.name || authorRow?.email || "Observer";

  const [inserted] = await db
    .insert(schema.pendingInjections)
    .values({
      sessionId,
      content,
      createdBy: authorId,
      createdByName: authorName,
    })
    .returning({ id: schema.pendingInjections.id });

  return NextResponse.json({ id: inserted.id, queued: true });
}
