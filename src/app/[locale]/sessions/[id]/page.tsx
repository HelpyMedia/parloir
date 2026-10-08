import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { loadHydrationBundle } from "@/lib/sessions/bundle";
import { SessionShell } from "@/components/session/layout/SessionShell";
import { listConnectedProviders, listLocalUrls } from "@/lib/credentials/service";
import { allowedCloudProviders, allowedLocalProviders } from "@/lib/config/edition";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const [bundle, cloud, local] = await Promise.all([
    loadHydrationBundle(id, user.id),
    listConnectedProviders(user.id),
    listLocalUrls(user.id),
  ]);
  if (!bundle) notFound();
  // Providers the model pickers may list when the person fixes the panel during a pause.
  const providers = [
    ...allowedCloudProviders().filter((p) => cloud.includes(p)),
    ...allowedLocalProviders().filter((p) => Boolean(local[p])),
  ];
  return <SessionShell bundle={bundle} providers={providers} />;
}
