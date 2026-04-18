import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/api/csrf";
import {
  deleteCredential,
  deleteLocalUrl,
  isCloudProvider,
  isLocalProvider,
} from "@/lib/credentials/service";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await requireUser();
  const { provider } = await params;
  if (isCloudProvider(provider)) {
    await deleteCredential(user.id, provider);
  } else if (isLocalProvider(provider)) {
    await deleteLocalUrl(user.id, provider);
  } else {
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
