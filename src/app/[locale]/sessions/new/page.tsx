import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { NewSessionForm, type NewSessionInitial } from "@/components/session-new/NewSessionForm";
import type { Depth } from "@/components/session-new/DepthSelector";
import { listTemplatePersonas } from "@/lib/personas";
import { requireUser } from "@/lib/auth/server";
import { listConnectedProviders, listLocalUrls } from "@/lib/credentials/service";
import { allowedCloudProviders, allowedLocalProviders, isHosted } from "@/lib/config/edition";
import { loadHydrationBundle } from "@/lib/sessions/bundle";
import { loadFailedSeats } from "@/lib/sessions/failed-seats";

export const dynamic = "force-dynamic";

function depthFromRounds(rounds: number): Depth {
  if (rounds <= 1) return "quick";
  if (rounds >= 3) return "deep";
  return "standard";
}

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireUser();
  const t = await getTranslations("NewSession");
  const { from } = await searchParams;

  const [personas, cloud, local] = await Promise.all([
    listTemplatePersonas(),
    listConnectedProviders(user.id),
    listLocalUrls(user.id),
  ]);

  const connectedProviders = [
    ...allowedCloudProviders().filter((p) => cloud.includes(p)),
    ...allowedLocalProviders().filter((p) => Boolean(local[p])),
  ];

  if (connectedProviders.length === 0) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[560px] flex-col items-center justify-center gap-6 px-6 py-10 text-center">
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
            {t("connectEyebrow")}
          </span>
          <h1 className="font-display text-2xl text-[var(--color-text-primary)]">{t("connectTitle")}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {isHosted() ? t("connectBody") : t("connectBodySelfHost")}
          </p>
        </div>
        <Link
          href="/settings"
          className="rounded bg-[var(--color-spot-warm)] px-4 py-2 font-mono text-xs uppercase tracking-wide text-[var(--color-bg-chamber)] transition-opacity hover:opacity-90"
        >
          {t("openSettings")}
        </Link>
      </main>
    );
  }

  // "Try again" from a failed session prefills the same question and panel,
  // swapping out the models that failed.
  let initial: NewSessionInitial | null = null;
  if (from) {
    const previous = await loadHydrationBundle(from, user.id).catch(() => null);
    if (previous) {
      const seatModels = previous.session.participantModelOverrides ?? {};
      const replacedSeats = await loadFailedSeats(previous.session.id, seatModels).catch(() => []);
      initial = {
        title: previous.session.title,
        question: previous.session.question,
        personaIds: previous.participantOrder,
        seatModels,
        depth: depthFromRounds(previous.session.protocol.maxCritiqueRounds),
        judgeModel: "",
        synthesizerModel: "",
        replacedSeats: replacedSeats.filter((r) => previous.participantOrder.includes(r.personaId)),
      };
    }
  }

  return (
    <NewSessionForm
      personas={personas}
      connectedProviders={connectedProviders}
      hasCloudProvider={connectedProviders.some((p) => p !== "ollama" && p !== "lmstudio")}
      initial={initial}
    />
  );
}
