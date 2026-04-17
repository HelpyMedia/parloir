import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import {
  deleteCredential,
  deleteLocalUrl,
  isCloudProvider,
  isLocalProvider,
} from "@/lib/credentials/service";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
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
