/**
 * Provider registry — per-request.
 *
 * Resolves a model ID like "anthropic/claude-opus-4.6" to a concrete
 * Vercel AI SDK LanguageModel. Credentials are supplied by a `ProviderContext`
 * (loaded per-debate from the authenticated user's stored keys), so each
 * session can use a different set of keys without process-wide singletons.
 *
 * Precedence (matches pre-BYOK behavior):
 *   1. Explicit prefixes (`openrouter/`, `ollama/`, `lmstudio/`, `vllm/`)
 *      force that provider.
 *   2. Native prefixes (`anthropic/`, `openai/`, `google/`) prefer the direct
 *      SDK if the user has a key for it, otherwise fall back to OpenRouter.
 *   3. Unknown prefixes default to OpenRouter.
 *
 * For local development, `PARLOIR_DEV_INHERIT_ENV=1` restores the old
 * process.env-based resolution so single-user dev instances keep working
 * while BYOK is wired up. Remove the shim once all callers pass a context.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";
import type { ProviderContext } from "@/lib/orchestrator/types";

function devInheritsEnv(): boolean {
  return process.env.PARLOIR_DEV_INHERIT_ENV === "1";
}

/**
 * Build a context from process.env for dev/single-user mode. Only honored
 * when `PARLOIR_DEV_INHERIT_ENV=1`. Never returns user-specific state.
 */
function envFallbackContext(): ProviderContext {
  const cloud: ProviderContext["cloud"] = {};
  if (process.env.ANTHROPIC_API_KEY) cloud.anthropic = process.env.ANTHROPIC_API_KEY;
  if (process.env.OPENAI_API_KEY) cloud.openai = process.env.OPENAI_API_KEY;
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) cloud.google = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (process.env.OPENROUTER_API_KEY) cloud.openrouter = process.env.OPENROUTER_API_KEY;
  const local: ProviderContext["local"] = {};
  if (process.env.OLLAMA_BASE_URL) local.ollama = process.env.OLLAMA_BASE_URL;
  if (process.env.LMSTUDIO_BASE_URL) local.lmstudio = process.env.LMSTUDIO_BASE_URL;
  return { cloud, local };
}

function effectiveContext(ctx: ProviderContext): ProviderContext {
  const hasAnything =
    Object.keys(ctx.cloud).length > 0 || Object.keys(ctx.local).length > 0;
  if (!hasAnything && devInheritsEnv()) {
    return envFallbackContext();
  }
  return ctx;
}

function openrouterFor(ctx: ProviderContext): ReturnType<typeof createOpenRouter> | null {
  const key = ctx.cloud.openrouter;
  return key ? createOpenRouter({ apiKey: key }) : null;
}

/**
 * Resolve a model ID to a LanguageModel using the caller-supplied context.
 * All credentials come from `ctx` — no module-level singletons.
 */
export function resolveModel(modelId: string, ctx: ProviderContext): LanguageModel {
  const c = effectiveContext(ctx);

  // Explicit provider prefixes first.
  if (modelId.startsWith("openrouter/")) {
    const or = openrouterFor(c);
    if (!or) throw new Error("OpenRouter API key not configured for this user");
    return or(modelId.slice("openrouter/".length));
  }

  if (modelId.startsWith("ollama/")) {
    const ollama = createOllama({
      baseURL: c.local.ollama ?? "http://localhost:11434/api",
    });
    return ollama(modelId.slice("ollama/".length));
  }

  if (modelId.startsWith("lmstudio/")) {
    const lmstudio = createOpenAI({
      apiKey: "lm-studio", // LM Studio ignores the key
      baseURL: c.local.lmstudio ?? "http://localhost:1234/v1",
    });
    return lmstudio(modelId.slice("lmstudio/".length));
  }

  if (modelId.startsWith("vllm/")) {
    // vLLM is not a v1 BYOK target; preserve env-only behavior for now.
    const baseURL = process.env.VLLM_BASE_URL;
    if (!baseURL) throw new Error("VLLM_BASE_URL not set");
    const vllm = createOpenAI({
      apiKey: process.env.VLLM_API_KEY ?? "vllm",
      baseURL,
    });
    return vllm(modelId.slice("vllm/".length));
  }

  // Native prefixes — prefer direct, fall back to OpenRouter.
  if (modelId.startsWith("anthropic/")) {
    const modelName = modelId.slice("anthropic/".length);
    if (c.cloud.anthropic) {
      return createAnthropic({ apiKey: c.cloud.anthropic })(modelName);
    }
    const or = openrouterFor(c);
    if (or) return or(modelId);
    throw new Error("No provider available for " + modelId);
  }

  if (modelId.startsWith("openai/")) {
    const modelName = modelId.slice("openai/".length);
    if (c.cloud.openai) {
      return createOpenAI({ apiKey: c.cloud.openai })(modelName);
    }
    const or = openrouterFor(c);
    if (or) return or(modelId);
    throw new Error("No provider available for " + modelId);
  }

  if (modelId.startsWith("google/") || modelId.startsWith("google-gemini/")) {
    const modelName = modelId.split("/").slice(1).join("/");
    if (c.cloud.google) {
      return createGoogleGenerativeAI({ apiKey: c.cloud.google })(modelName);
    }
    const or = openrouterFor(c);
    if (or) return or(modelId);
    throw new Error("No provider available for " + modelId);
  }

  // Anything else — default to OpenRouter (handles x-ai/, deepseek/, meta-llama/, etc.)
  const or = openrouterFor(c);
  if (or) return or(modelId);

  throw new Error(
    `Cannot resolve model "${modelId}". Connect a provider at /settings.`,
  );
}

/** Returns the list of provider families available in a context. */
export function availableProviders(ctx: ProviderContext): string[] {
  const c = effectiveContext(ctx);
  const out: string[] = [];
  if (c.cloud.anthropic) out.push("anthropic");
  if (c.cloud.openai) out.push("openai");
  if (c.cloud.google) out.push("google");
  if (c.cloud.openrouter) out.push("openrouter");
  if (c.local.ollama) out.push("ollama");
  if (c.local.lmstudio) out.push("lmstudio");
  return out;
}
