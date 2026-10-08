import {
  getCredential,
  listConnectedProviders,
  listLocalUrls,
} from "./service";
import { allowedCloudProviders, allowedLocalProviders } from "@/lib/config/edition";
import type { ProviderContext } from "@/lib/orchestrator/types";

export async function loadProviderContext(userId: string): Promise<ProviderContext> {
  const [connectedCloud, local] = await Promise.all([
    listConnectedProviders(userId),
    listLocalUrls(userId),
  ]);
  // Ignore credentials for providers this edition doesn't offer (e.g. a key
  // stored before the hosted service went OpenRouter-only).
  const cloudAllowed = new Set(allowedCloudProviders());
  const localAllowed = new Set(allowedLocalProviders());

  const cloud: ProviderContext["cloud"] = {};
  const keys = await Promise.all(
    connectedCloud
      .filter((p) => cloudAllowed.has(p))
      .map(async (p) => [p, await getCredential(userId, p)] as const),
  );
  for (const [p, key] of keys) {
    if (key) cloud[p] = key;
  }

  const localUrls: ProviderContext["local"] = {};
  for (const [p, url] of Object.entries(local)) {
    if (url && localAllowed.has(p as never)) localUrls[p as keyof ProviderContext["local"]] = url;
  }
  return { cloud, local: localUrls };
}
