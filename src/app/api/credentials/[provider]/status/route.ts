/**
 * GET /api/credentials/openrouter/status — what the user's stored OpenRouter
 * key can do: free tier or paid, spend so far, remaining limit. Shown in
 * Settings so people understand the free-model daily cap before they hit it.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getCredential } from "@/lib/credentials/service";

interface KeyInfo {
  label?: string;
  is_free_tier?: boolean;
  limit?: number | null;
  limit_remaining?: number | null;
  usage?: number;
  usage_daily?: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await requireUser();
  const { provider } = await params;
  if (provider !== "openrouter") {
    return NextResponse.json({ error: "unsupported provider" }, { status: 400 });
  }
  const key = await getCredential(user.id, "openrouter");
  if (!key) return NextResponse.json({ connected: false });

  try {
    const r = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (r.status === 401 || r.status === 403) {
      return NextResponse.json({ connected: true, valid: false });
    }
    if (!r.ok) return NextResponse.json({ connected: true, valid: null });
    const { data } = (await r.json()) as { data?: KeyInfo };
    return NextResponse.json(
      {
        connected: true,
        valid: true,
        freeTier: data?.is_free_tier ?? null,
        limit: data?.limit ?? null,
        limitRemaining: data?.limit_remaining ?? null,
        usage: data?.usage ?? null,
        usageToday: data?.usage_daily ?? null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json({ connected: true, valid: null });
  }
}
