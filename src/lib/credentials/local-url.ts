/**
 * Pure leaf module: provider-kind constants and URL normalization with no
 * database or crypto dependencies. Split out of `service.ts` so that
 * dependency-lean consumers (the provider registry, parloir-cloud adapter)
 * can import these without pulling in the full credential persistence
 * surface.
 *
 * Do not add DB, crypto, or network imports here. `service.ts` re-exports
 * everything in this file for backward compatibility.
 */

export type CloudProvider = "openrouter" | "anthropic" | "openai" | "google";
export type LocalProvider = "ollama" | "lmstudio";

export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  "openrouter",
  "anthropic",
  "openai",
  "google",
];
export const LOCAL_PROVIDERS: readonly LocalProvider[] = ["ollama", "lmstudio"];

export function isCloudProvider(v: string): v is CloudProvider {
  return (CLOUD_PROVIDERS as readonly string[]).includes(v);
}

export function isLocalProvider(v: string): v is LocalProvider {
  return (LOCAL_PROVIDERS as readonly string[]).includes(v);
}

/**
 * Normalize a local-provider base URL to its root form (no trailing `/api`,
 * `/v1`, or slash). All consumers — the test route, models catalog, and the
 * provider registry — append the appropriate suffix themselves, so we store
 * the root only. This makes user input forgiving: `http://localhost:11434`,
 * `http://localhost:11434/`, and `http://localhost:11434/api` all normalize
 * to the same value.
 */
export function normalizeLocalBaseUrl(
  provider: LocalProvider,
  url: string,
): string {
  const suffixes = provider === "ollama" ? ["/api"] : ["/v1"];
  let trimmed = url.trim().replace(/\/+$/, "");
  for (const s of suffixes) {
    if (trimmed.toLowerCase().endsWith(s)) trimmed = trimmed.slice(0, -s.length);
  }
  return trimmed;
}
