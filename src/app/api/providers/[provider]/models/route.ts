import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server";
import { getCredential, listLocalUrls, normalizeLocalBaseUrl } from "@/lib/credentials/service";
import { CURATED } from "@/lib/providers/catalog";
import { safeFetch, SsrfBlockedError } from "@/lib/net/safe-fetch";

interface OpenRouterModel { id: string; name?: string }
interface OllamaTagsResponse { models?: Array<{ name: string }> }
interface OpenAICompatModels { data?: Array<{ id: string }> }

function upstreamErrorResponse(err: unknown): NextResponse {
  if (err instanceof SsrfBlockedError) {
    return NextResponse.json({ error: "host not allowed" }, { status: 502 });
  }
  return NextResponse.json({ error: "upstream_unreachable" }, { status: 502 });
}

async function openRouterModels(apiKey: string) {
  const r = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`openrouter ${r.status}`);
  const body = (await r.json()) as { data: OpenRouterModel[] };
  return body.data.map((m) => ({ id: `openrouter/${m.id}`, label: m.name ?? m.id }));
}

async function ollamaModels(baseUrl: string) {
  const r = await safeFetch(normalizeLocalBaseUrl("ollama", baseUrl) + "/api/tags", {
    timeoutMs: 4000,
  });
  if (!r.ok) throw new Error(`ollama ${r.status}`);
  const body = (await r.json()) as OllamaTagsResponse;
  return (body.models ?? []).map((m) => ({ id: `ollama/${m.name}`, label: m.name }));
}

async function lmstudioModels(baseUrl: string) {
  const r = await safeFetch(normalizeLocalBaseUrl("lmstudio", baseUrl) + "/v1/models", {
    timeoutMs: 4000,
  });
  if (!r.ok) throw new Error(`lmstudio ${r.status}`);
  const body = (await r.json()) as OpenAICompatModels;
  return (body.data ?? []).map((m) => ({ id: `lmstudio/${m.id}`, label: m.id }));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const user = await requireUser();
  const { provider } = await params;

  try {
    if (provider === "openrouter") {
      const key = await getCredential(user.id, "openrouter");
      if (!key) return NextResponse.json({ error: "provider not connected" }, { status: 409 });
      const models = await openRouterModels(key);
      return NextResponse.json({ models }, {
        headers: { "Cache-Control": "private, max-age=30" },
      });
    }
    if (provider === "ollama") {
      const local = await listLocalUrls(user.id);
      if (!local.ollama) return NextResponse.json({ error: "provider not connected" }, { status: 409 });
      const models = await ollamaModels(local.ollama);
      return NextResponse.json({ models }, {
        headers: { "Cache-Control": "private, max-age=30" },
      });
    }
    if (provider === "lmstudio") {
      const local = await listLocalUrls(user.id);
      if (!local.lmstudio) return NextResponse.json({ error: "provider not connected" }, { status: 409 });
      const models = await lmstudioModels(local.lmstudio);
      return NextResponse.json({ models }, {
        headers: { "Cache-Control": "private, max-age=30" },
      });
    }
    if (provider === "anthropic" || provider === "openai" || provider === "google") {
      return NextResponse.json({ models: CURATED[provider] }, {
        headers: { "Cache-Control": "private, max-age=300" },
      });
    }
    return NextResponse.json({ error: "unknown provider" }, { status: 400 });
  } catch (err) {
    return upstreamErrorResponse(err);
  }
}
