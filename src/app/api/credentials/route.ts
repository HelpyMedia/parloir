import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { assertSameOrigin } from "@/lib/api/csrf";
import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS,
  listConnectedProviders,
  listLocalUrls,
  upsertCredential,
  upsertLocalUrl,
  isCloudProvider,
  isLocalProvider,
} from "@/lib/credentials/service";

const UpsertSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cloud"),
    provider: z.enum(CLOUD_PROVIDERS as unknown as [string, ...string[]]),
    apiKey: z.string().min(1).max(4000),
  }),
  z.object({
    kind: z.literal("local"),
    provider: z.enum(LOCAL_PROVIDERS as unknown as [string, ...string[]]),
    baseUrl: z.string().url().max(1000),
  }),
]);

export async function GET() {
  const user = await requireUser();
  const [cloud, local] = await Promise.all([
    listConnectedProviders(user.id),
    listLocalUrls(user.id),
  ]);
  return NextResponse.json({ cloud, local });
}

export async function POST(req: NextRequest) {
  const csrf = assertSameOrigin(req);
  if (csrf) return csrf;
  const user = await requireUser();
  const body = await req.json();
  const parsed = UpsertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const input = parsed.data;
  if (input.kind === "cloud" && isCloudProvider(input.provider)) {
    await upsertCredential(user.id, input.provider, input.apiKey);
  } else if (input.kind === "local" && isLocalProvider(input.provider)) {
    await upsertLocalUrl(user.id, input.provider, input.baseUrl);
  }
  return NextResponse.json({ ok: true, provider: input.provider });
}
