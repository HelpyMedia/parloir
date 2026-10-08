/**
 * Edition switch: self-hosted (default) vs the public hosted service.
 *
 * PARLOIR_HOSTED=1 narrows the product to bring-your-own OpenRouter key:
 *   - OpenRouter is the only provider users can connect or pick models from.
 *   - Local servers (Ollama, LM Studio, vLLM) are disabled: on a shared
 *     server they would point at the host's own network.
 * Self-hosters keep every provider.
 *
 * Dependency-lean on purpose (no DB/crypto) so the registry can import it.
 */

import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS,
  type CloudProvider,
  type LocalProvider,
} from "../credentials/local-url";

export function isHosted(): boolean {
  return process.env.PARLOIR_HOSTED === "1";
}

export function allowedCloudProviders(): readonly CloudProvider[] {
  return isHosted() ? ["openrouter"] : CLOUD_PROVIDERS;
}

export function allowedLocalProviders(): readonly LocalProvider[] {
  return isHosted() ? [] : LOCAL_PROVIDERS;
}

/** Model-ID prefixes a session may use in this edition. */
export function allowedModelPrefixes(): readonly string[] {
  return isHosted()
    ? ["openrouter"]
    : ["anthropic", "openai", "google", "openrouter", "ollama", "lmstudio", "vllm"];
}

export function isAllowedModelId(modelId: string): boolean {
  const prefix = modelId.split("/")[0];
  return allowedModelPrefixes().includes(prefix) && modelId.length > prefix.length + 1;
}
