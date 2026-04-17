import { ConsensusDial } from "./ConsensusDial";
import { CurrentBestCard } from "./CurrentBestCard";
import { KeyTensionCard } from "./KeyTensionCard";
import { SourcesCard } from "./SourcesCard";
import { UnresolvedCard } from "./UnresolvedCard";
import type { InsightView } from "@/lib/session-ui/derive";

interface Props {
  insights: InsightView;
}

export function InsightRail({ insights }: Props) {
  return (
    <aside
      aria-label="Session insights"
      className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 py-4"
    >
      <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
        Insights
      </div>
      <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3">
        <ConsensusDial level={insights.consensusLevel} />
      </div>
      <CurrentBestCard value={insights.currentBest} />
      <KeyTensionCard value={insights.keyTension} />
      <UnresolvedCard items={insights.unresolved} />
      <SourcesCard count={insights.sourcesUsed} />
    </aside>
  );
}
