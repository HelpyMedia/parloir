import { desc, eq } from "drizzle-orm";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/server";
import { PhaseBadge } from "@/components/session/shared/PhaseBadge";

export const dynamic = "force-dynamic";

type DashboardCopy = {
  justNow: string;
  minutes: (n: number) => string;
  hours: (n: number) => string;
  days: (n: number) => string;
};

function formatRelative(date: Date, copy: DashboardCopy): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return copy.justNow;
  if (mins < 60) return copy.minutes(mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return copy.hours(hours);
  const days = Math.round(hours / 24);
  return copy.days(days);
}

export default async function SessionsDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireUser();
  const t = await getTranslations("SessionsDashboard");

  const rows = await db
    .select({
      id: sessions.id,
      title: sessions.title,
      status: sessions.status,
      currentRound: sessions.currentRound,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .where(eq(sessions.createdBy, user.id))
    .orderBy(desc(sessions.createdAt))
    .limit(50);

  const copy: DashboardCopy = {
    justNow: t("createdRelativeJustNow"),
    minutes: (n) => t("createdRelativeMinutes", { n }),
    hours: (n) => t("createdRelativeHours", { n }),
    days: (n) => t("createdRelativeDays", { n }),
  };

  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl text-[var(--color-text-primary)]">
            {t("title")}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href="/sessions/new"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-warm)]/30"
        >
          <Plus className="h-4 w-4" />
          {t("newSession")}
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-8 text-center">
          <p className="font-display text-lg text-[var(--color-text-primary)]">
            {t("emptyHeadline")}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("emptyBody")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((s) => (
            <li key={s.id}>
              <Link
                href={`/sessions/${s.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-3 transition-colors hover:border-[var(--color-border-strong)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display text-base text-[var(--color-text-primary)]">
                    {s.title}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                    {formatRelative(s.createdAt, copy)}
                  </div>
                </div>
                <PhaseBadge phase={s.status} round={s.currentRound} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
