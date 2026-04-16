/**
 * Provider registry.
 *
 * Resolves a model ID string like "anthropic/claude-opus-4.6" to a concrete
 * Vercel AI SDK LanguageModel instance. Precedence rules:
 *
 *   1. If the model's native provider has a direct API key set, use it.
 *      (Lower latency, sometimes cheaper, always more reliable.)
 *   2. Fall back to OpenRouter.
 *   3. "ollama/*" and "lmstudio/*" IDs resolve to local endpoints.
 *   4. Any "/vllm/*" or custom prefix maps to VLLM_BASE_URL (OpenAI-compatible).
 *
 * The unified model ID format means personas can declare "anthropic/claude-opus-4.6"
 * and the registry picks the best route at runtime. Swap routes without
 * touching persona configs.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createOllama } from "ollama-ai-provider-v2";
import type { LanguageModel } from "ai";

// Lazy-init providers — only construct if API keys are present.
const anthropic = process.env.ANTHROPIC_API_KEY
  ? createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const openai = process.env.OPENAI_API_KEY
  ? createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const google = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ? createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY })
  : null;

const openrouter = process.env.OPENROUTER_API_KEY
  ? createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })
  : null;

const ollama = createOllama({
  baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/api",
});

// LM Studio is OpenAI-compatible — reuse the OpenAI provider with a custom base URL.
const lmstudio = createOpenAI({
  apiKey: "lm-studio", // LM Studio ignores the key but the SDK requires one
  baseURL: process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1",
});

const vllm = process.env.VLLM_BASE_URL
  ? createOpenAI({
      apiKey: process.env.VLLM_API_KEY ?? "vllm",
      baseURL: process.env.VLLM_BASE_URL,
    })
  : null;

/**
 * Resolve a model ID to a LanguageModel.
 *
 * Format: "provider/model[:variant]"
 * Examples:
 *   "anthropic/claude-opus-4.6"       → direct Anthropic if key set, else OpenRouter
 *   "openai/gpt-5.4"                  → direct OpenAI if key set, else OpenRouter
 *   "openrouter/anthropic/claude-..."  → forced OpenRouter
 *   "ollama/llama3.2"                  → local Ollama
 *   "lmstudio/mistral-7b"              → local LM Studio
 *   "vllm/meta-llama/Llama-3-70B"      → custom vLLM endpoint
 */
export function resolveModel(modelId: string): LanguageModel {
  // Explicit provider prefixes first
  if (modelId.startsWith("openrouter/")) {
    if (!openrouter) throw new Error("OPENROUTER_API_KEY not set");
    return openrouter(modelId.slice("openrouter/".length));
  }

  if (modelId.startsWith("ollama/")) {
    return ollama(modelId.slice("ollama/".length));
  }

  if (modelId.startsWith("lmstudio/")) {
    return lmstudio(modelId.slice("lmstudio/".length));
  }

  if (modelId.startsWith("vllm/")) {
    if (!vllm) throw new Error("VLLM_BASE_URL not set");
    return vllm(modelId.slice("vllm/".length));
  }

  // Native provider prefixes — prefer direct, fall back to OpenRouter.
  if (modelId.startsWith("anthropic/")) {
    const modelName = modelId.slice("anthropic/".length);
    if (anthropic) return anthropic(modelName);
    if (openrouter) return openrouter(modelId);
    throw new Error("No provider available for " + modelId);
  }

  if (modelId.startsWith("openai/")) {
    const modelName = modelId.slice("openai/".length);
    if (openai) return openai(modelName);
    if (openrouter) return openrouter(modelId);
    throw new Error("No provider available for " + modelId);
  }

  if (modelId.startsWith("google/") || modelId.startsWith("google-gemini/")) {
    const modelName = modelId.split("/").slice(1).join("/");
    if (google) return google(modelName);
    if (openrouter) return openrouter(modelId);
    throw new Error("No provider available for " + modelId);
  }

  // Anything else — default to OpenRouter (it handles x-ai/, deepseek/, meta-llama/, etc.)
  if (openrouter) return openrouter(modelId);

  throw new Error(
    `Cannot resolve model "${modelId}". No matching provider configured. ` +
      "Set OPENROUTER_API_KEY for broad access, or set provider-specific keys.",
  );
}

/** Returns the list of provider families currently configured. */
export function availableProviders(): string[] {
  const out: string[] = [];
  if (anthropic) out.push("anthropic");
  if (openai) out.push("openai");
  if (google) out.push("google");
  if (openrouter) out.push("openrouter");
  if (process.env.OLLAMA_BASE_URL || true) out.push("ollama");
  out.push("lmstudio");
  if (vllm) out.push("vllm");
  return out;
}
