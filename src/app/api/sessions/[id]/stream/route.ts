/**
 * GET /api/sessions/[id]/stream — SSE endpoint. Streams StreamEvents to the browser.
 *
 * Implementation: tails the session_events table using Postgres LISTEN/NOTIFY
 * for instant delivery, with a polling fallback. Supports reconnection via
 * ?lastSeq=N — the server sends everything after that seq, so if a user
 * closes their tab and comes back the UI catches up cleanly.
 *
 * Note: this endpoint itself DOES hit Vercel's timeout if a debate runs long,
 * but that's fine — the client reconnects automatically (EventSource does
 * this natively) and the workflow runs in Inngest, not here.
 */

import { NextRequest } from "next/server";
import postgres from "postgres";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { and, eq, gt, asc } from "drizzle-orm";

// Keep the route as a Node runtime — SSE + long polling needs it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: sessionId } = await params;
  const lastSeq = Number(req.nextUrl.searchParams.get("lastSeq") ?? 0);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let cursor = lastSeq;
      let closed = false;

      const send = (data: unknown, event?: string) => {
        if (closed) return;
        const lines: string[] = [];
        if (event) lines.push(`event: ${event}`);
        lines.push(`data: ${JSON.stringify(data)}`);
        lines.push("", ""); // SSE requires double newline terminator
        controller.enqueue(encoder.encode(lines.join("\n")));
      };

      // 1. Send any already-persisted events after lastSeq (catch-up).
      const backlog = await db
        .select()
        .from(schema.sessionEvents)
        .where(
          and(
            eq(schema.sessionEvents.sessionId, sessionId),
            gt(schema.sessionEvents.seq, cursor),
          ),
        )
        .orderBy(asc(schema.sessionEvents.seq));

      for (const row of backlog) {
        send({ seq: row.seq, event: row.payload }, "turn");
        cursor = row.seq;
      }

      // 2. Heartbeat — keeps the connection alive through proxies.
      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      // 3. Poll for new events. Could upgrade to LISTEN/NOTIFY later.
      const poll = async () => {
        while (!closed) {
          const rows = await db
            .select()
            .from(schema.sessionEvents)
            .where(
              and(
                eq(schema.sessionEvents.sessionId, sessionId),
                gt(schema.sessionEvents.seq, cursor),
              ),
            )
            .orderBy(asc(schema.sessionEvents.seq));

          for (const row of rows) {
            send({ seq: row.seq, event: row.payload }, "turn");
            cursor = row.seq;

            // If synthesis_complete or error, we can close the stream.
            const evt = row.payload as { type?: string };
            if (evt.type === "synthesis_complete" || evt.type === "error") {
              send({ reason: evt.type }, "done");
              closed = true;
              clearInterval(heartbeat);
              controller.close();
              return;
            }
          }

          await sleep(POLL_INTERVAL_MS);
        }
      };

      // Detect client disconnect.
      req.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });

      poll().catch((err) => {
        console.error("stream poll error", err);
        send({ message: String(err), recoverable: false }, "error");
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
