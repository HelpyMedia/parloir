/**
 * Session authorization helper.
 *
 * Every session-read path must check that the caller actually owns the
 * session before returning anything. Without this check, any authenticated
 * user can enumerate session UUIDs and read another tenant's full transcript
 * and synthesis.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export type SessionRow = typeof schema.sessions.$inferSelect;

/**
 * Fetch a session by ID and assert the user owns it.
 *
 * Returns `{ status: "ok", session }` on success.
 * Returns `{ status: "not_found" }` if the session doesn't exist OR the user
 * doesn't own it — callers should treat both identically (don't leak
 * existence to an attacker with a UUID guess).
 */
export async function getOwnedSession(
  sessionId: string,
  userId: string,
): Promise<{ status: "ok"; session: SessionRow } | { status: "not_found" }> {
  const session = await db.query.sessions.findFirst({
    where: eq(schema.sessions.id, sessionId),
  });
  if (!session || session.createdBy !== userId) {
    return { status: "not_found" };
  }
  return { status: "ok", session };
}
