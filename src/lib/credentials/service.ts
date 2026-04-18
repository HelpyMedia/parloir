import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { encrypt, decrypt } from "@/lib/crypto/keyring";
import { assertPublicHttpUrl, SsrfBlockedError } from "@/lib/net/safe-fetch";

export type CloudProvider = "openrouter" | "anthropic" | "openai" | "google";
export type LocalProvider = "ollama" | "lmstudio";

export const CLOUD_PROVIDERS: readonly CloudProvider[] = ["openrouter", "anthropic", "openai", "google"];
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
export function normalizeLocalBaseUrl(provider: LocalProvider, url: string): string {
  const suffixes = provider === "ollama" ? ["/api"] : ["/v1"];
  let trimmed = url.trim().replace(/\/+$/, "");
  for (const s of suffixes) {
    if (trimmed.toLowerCase().endsWith(s)) trimmed = trimmed.slice(0, -s.length);
  }
  return trimmed;
}

export async function upsertCredential(userId: string, provider: CloudProvider, apiKey: string): Promise<void> {
  const ct = encrypt(apiKey);
  await db
    .insert(schema.userCredentials)
    .values({ userId, provider, ...ct })
    .onConflictDoUpdate({
      target: [schema.userCredentials.userId, schema.userCredentials.provider],
      set: { ...ct, updatedAt: new Date() },
    });
}

export async function getCredential(userId: string, provider: CloudProvider): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.userCredentials)
    .where(and(eq(schema.userCredentials.userId, userId), eq(schema.userCredentials.provider, provider)))
    .limit(1);
  if (!row) return null;
  return decrypt({ iv: row.iv, tag: row.tag, payload: row.payload });
}

export async function listConnectedProviders(userId: string): Promise<CloudProvider[]> {
  const rows = await db
    .select({ provider: schema.userCredentials.provider })
    .from(schema.userCredentials)
    .where(eq(schema.userCredentials.userId, userId));
  return rows.map((r) => r.provider).filter(isCloudProvider);
}

export async function deleteCredential(userId: string, provider: CloudProvider): Promise<void> {
  await db
    .delete(schema.userCredentials)
    .where(and(eq(schema.userCredentials.userId, userId), eq(schema.userCredentials.provider, provider)));
}

export async function upsertLocalUrl(userId: string, provider: LocalProvider, baseUrl: string): Promise<void> {
  const normalized = normalizeLocalBaseUrl(provider, baseUrl);
  // Reject URLs that point into private / metadata ranges at write time. In
  // development the safe-fetch module relaxes this so localhost still works.
  try {
    await assertPublicHttpUrl(normalized);
  } catch (e) {
    if (e instanceof SsrfBlockedError) {
      throw new Error(`Refusing to store base URL: ${e.message}`);
    }
    throw e;
  }
  await db
    .insert(schema.userProviderSettings)
    .values({ userId, provider, baseUrl: normalized })
    .onConflictDoUpdate({
      target: [schema.userProviderSettings.userId, schema.userProviderSettings.provider],
      set: { baseUrl: normalized, updatedAt: new Date() },
    });
}

export async function deleteLocalUrl(userId: string, provider: LocalProvider): Promise<void> {
  await db
    .delete(schema.userProviderSettings)
    .where(and(eq(schema.userProviderSettings.userId, userId), eq(schema.userProviderSettings.provider, provider)));
}

export async function listLocalUrls(userId: string): Promise<Partial<Record<LocalProvider, string>>> {
  const rows = await db
    .select({ provider: schema.userProviderSettings.provider, baseUrl: schema.userProviderSettings.baseUrl })
    .from(schema.userProviderSettings)
    .where(eq(schema.userProviderSettings.userId, userId));
  const out: Partial<Record<LocalProvider, string>> = {};
  for (const r of rows) {
    if (isLocalProvider(r.provider)) out[r.provider] = r.baseUrl;
  }
  return out;
}
