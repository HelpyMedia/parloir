import { requireUser } from "@/lib/auth/server";
import { listConnectedProviders, listLocalUrls } from "@/lib/credentials/service";
import { ProviderList } from "@/components/settings/ProviderList";

export default async function SettingsPage() {
  const user = await requireUser();
  const [cloud, local] = await Promise.all([
    listConnectedProviders(user.id),
    listLocalUrls(user.id),
  ]);
  return (
    <main className="min-h-dvh bg-[var(--color-bg-chamber)] px-6 py-10">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-[var(--color-text-primary)]">Settings</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
            Providers · {user.email}
          </p>
        </header>
        <ProviderList cloud={cloud} local={local} />
      </div>
    </main>
  );
}
