import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth/server";
import { listConnectedProviders, listLocalUrls } from "@/lib/credentials/service";
import { ProviderList } from "@/components/settings/ProviderList";
import { DeleteAccount } from "@/components/settings/DeleteAccount";
import { isHosted } from "@/lib/config/edition";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ openrouter?: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("Settings");
  const { openrouter } = await searchParams;
  const [cloud, local] = await Promise.all([listConnectedProviders(user.id), listLocalUrls(user.id)]);

  return (
    <main className="min-h-dvh bg-[var(--color-bg-chamber)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-3xl text-[var(--color-text-primary)]">{t("title")}</h1>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
            {t("subtitle", { email: user.email })}
          </p>
        </header>

        {openrouter === "connected" && (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] p-3 text-sm text-[var(--color-text-primary)]"
          >
            <span>{t("connectedOk")}</span>
            <Link href="/sessions/new" className="font-mono text-xs uppercase tracking-wide text-[var(--color-spot-warm)]">
              {t("startDebate")}
            </Link>
          </div>
        )}
        {openrouter === "error" && (
          <div
            role="alert"
            className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
          >
            {t("connectError")}
          </div>
        )}

        <ProviderList cloud={cloud} local={local} hosted={isHosted()} />

        <DeleteAccount email={user.email} />
      </div>
    </main>
  );
}
