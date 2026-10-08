import { useTranslations } from "next-intl";
import { ConsensusDial } from "./ConsensusDial";
import { CurrentBestCard } from "./CurrentBestCard";
import { KeyTensionCard } from "./KeyTensionCard";
import { UnresolvedCard } from "./UnresolvedCard";
import type { InsightView } from "@/lib/session-ui/derive";

interface Props {
  insights: InsightView;
}

export function InsightRail({ insights }: Props) {
  const t = useTranslations("Council");
  return (
    <aside
      aria-label={t("insightsLabel")}
      className="flex w-full shrink-0 flex-col gap-3 border-t border-[var(--color-border-subtle)] lg:w-72 lg:border-l lg:border-t-0 border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 py-4"
    >
      <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {t("insights")}
      </div>
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3">
        <ConsensusDial level={insights.consensusLevel} />
      </div>
      <CurrentBestCard value={insights.currentBest} />
      <KeyTensionCard value={insights.keyTension} />
      <UnresolvedCard items={insights.unresolved} />
    </aside>
  );
}
