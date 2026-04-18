import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/server";
import { isCloudProvider, isLocalProvider, normalizeLocalBaseUrl, type LocalProvider } from "@/lib/credentials/service";
import { safeFetch, SsrfBlockedError } from "@/lib/net/safe-fetch";
import { withRateLimit, RATE_LIMITS } from "@/lib/rate-limit/token-bucket";

const TestBody = z.object({
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
});

async function testCloud(provider: string, apiKey: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    if (provider === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      return { ok: true };
    }
    if (provider === "anthropic") {
      // Anthropic doesn't have a pure auth-check endpoint; list models.
      const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      return { ok: true };
    }
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      return { ok: true };
    }
    if (provider === "google") {
      // Google Generative Language API: list models
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      return { ok: true };
    }
    return { ok: false, detail: "unsupported provider" };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

async function testLocal(provider: LocalProvider, baseUrl: string): Promise<{ ok: boolean; detail?: string }> {
  try {
    const root = normalizeLocalBaseUrl(provider, baseUrl);
    if (provider === "ollama") {
      const r = await safeFetch(root + "/api/tags", { timeoutMs: 4000 });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      return { ok: true };
    }
    if (provider === "lmstudio") {
      const r = await safeFetch(root + "/v1/models", { timeoutMs: 4000 });
      if (!r.ok) return { ok: false, detail: `HTTP ${r.status}` };
      return { ok: true };
    }
    return { ok: false, detail: "unsupported provider" };
  } catch (e) {
    if (e instanceof SsrfBlockedError) {
      return { ok: false, detail: "host not allowed" };
    }
    return { ok: false, detail: "unreachable" };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await requireUser();

  const limited = await withRateLimit(
    req,
    "credential:test",
    RATE_LIMITS.credentialTest,
    user.id,
    async () => null,
  );
  if (limited instanceof NextResponse) return limited;

  const { provider } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = TestBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }
  const { apiKey, baseUrl } = parsed.data;

  if (isCloudProvider(provider)) {
    if (!apiKey) return NextResponse.json({ ok: false, detail: "apiKey required" }, { status: 400 });
    return NextResponse.json(await testCloud(provider, apiKey));
  }
  if (isLocalProvider(provider)) {
    if (!baseUrl) return NextResponse.json({ ok: false, detail: "baseUrl required" }, { status: 400 });
    return NextResponse.json(await testLocal(provider, baseUrl));
  }
  return NextResponse.json({ ok: false, detail: "unknown provider" }, { status: 400 });
}
