/**
 * GET /api/sessions/[id] — hydration bundle for the live session UI.
 *
 * Returns everything the client needs to render initial state before opening
 * the SSE stream. See src/lib/sessions/bundle.ts.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { loadHydrationBundle } from "@/lib/sessions/bundle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;
  const bundle = await loadHydrationBundle(id, user.id);
  if (!bundle) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json(bundle);
}
