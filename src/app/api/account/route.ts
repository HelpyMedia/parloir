/**
 * DELETE /api/account — permanently delete the signed-in user.
 *
 * Every user-owned table cascades on users.id (auth sessions, credentials,
 * debates, turns, events, artifacts), so one delete removes all of it.
 * Required for a public service: users must be able to erase their data
 * (Québec Law 25, GDPR) without emailing anyone.
 */
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/api/csrf";

export async function DELETE(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await requireUser();

  const body = (await req.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== user.email) {
    return NextResponse.json({ error: "Type your email address to confirm." }, { status: 400 });
  }

  await db.delete(schema.users).where(eq(schema.users.id, user.id));

  const res = NextResponse.json({ deleted: true });
  // Drop the (now dangling) session cookie in both its plain and secure forms.
  for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token"]) {
    res.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
  return res;
}
