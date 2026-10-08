import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { loadHydrationBundle } from "@/lib/sessions/bundle";
import { SessionShell } from "@/components/session/layout/SessionShell";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const bundle = await loadHydrationBundle(id, user.id);
  if (!bundle) notFound();
  return <SessionShell bundle={bundle} />;
}
