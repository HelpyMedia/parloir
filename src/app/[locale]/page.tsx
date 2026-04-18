import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Landing" });
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `/${l}`;
  languages["x-default"] = `/${routing.defaultLocale}`;
  return {
    title: t("headline"),
    description: t("subhead"),
    alternates: { languages },
    openGraph: {
      title: t("headline"),
      description: t("subhead"),
      locale,
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Landing");

  const phases = [
    { title: t("phaseOpeningTitle"), body: t("phaseOpeningBody") },
    { title: t("phaseCritiqueTitle"), body: t("phaseCritiqueBody") },
    { title: t("phaseConsensusTitle"), body: t("phaseConsensusBody") },
    { title: t("phaseAdaptiveTitle"), body: t("phaseAdaptiveBody") },
    { title: t("phaseSynthesisTitle"), body: t("phaseSynthesisBody") },
  ];

  const features = [
    { title: t("featureByokTitle"), body: t("featureByokBody") },
    { title: t("featureDurableTitle"), body: t("featureDurableBody") },
    { title: t("featureStreamTitle"), body: t("featureStreamBody") },
    { title: t("featurePauseTitle"), body: t("featurePauseBody") },
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-24 px-6 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-4xl text-[var(--color-text-primary)] md:text-5xl">
          {t("headline")}
        </h1>
        <p className="max-w-[52ch] text-[var(--color-text-muted)]">
          {t("subhead")}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/signup"
            className="rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-6 py-3 font-display text-base text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-warm)]/30"
          >
            {t("ctaPrimary")}
          </Link>
          <Link
            href="/signin"
            className="rounded-lg border border-[var(--color-border-subtle)] px-6 py-3 font-display text-base text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-border-strong)]"
          >
            {t("ctaSecondary")}
          </Link>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
          {t("howItWorksTitle")}
        </h2>
        <ol className="grid gap-3 md:grid-cols-5">
          {phases.map((p, i) => (
            <li
              key={p.title}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-4"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-dim)]">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="mt-2 font-display text-base text-[var(--color-text-primary)]">
                {p.title}
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                {p.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="space-y-6">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
          {t("featuresTitle")}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-6"
            >
              <div className="font-display text-lg text-[var(--color-text-primary)]">
                {f.title}
              </div>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-[var(--color-border-subtle)] pt-6 text-center text-xs text-[var(--color-text-dim)]">
        {t("footerTagline")}
      </footer>
    </main>
  );
}
