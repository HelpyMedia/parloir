import {
  CLOUD_PROVIDERS,
  getCredential,
  listConnectedProviders,
  listLocalUrls,
} from "./service";
import type { ProviderContext } from "@/lib/orchestrator/types";

export async function loadProviderContext(userId: string): Promise<ProviderContext> {
  const [connectedCloud, local] = await Promise.all([
    listConnectedProviders(userId),
    listLocalUrls(userId),
  ]);
  const cloud: ProviderContext["cloud"] = {};
  // Decrypt each in parallel for speed.
  const keys = await Promise.all(
    connectedCloud.map(async (p) => [p, await getCredential(userId, p)] as const),
  );
  for (const [p, key] of keys) {
    if (key) cloud[p] = key;
  }
  return { cloud, local };
}
