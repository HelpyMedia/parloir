import { useTranslations } from "next-intl";
import { PhaseBadge } from "../shared/PhaseBadge";
import type { Phase, Session } from "@/lib/orchestrator/types";

interface Props {
  session: Session;
  phase: Phase;
  round: number;
  totalCostUsd: number;
}

export function TopBar({ session, phase, round, totalCostUsd }: Props) {
  const t = useTranslations("Council");
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 py-2 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <h1 className="max-w-[40ch] truncate font-display text-base text-[var(--color-text-primary)]">
          {session.title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <PhaseBadge phase={phase} round={round} />
        <span className="font-mono text-xs text-[var(--color-text-dim)]" title={t("cost")}>
          ${totalCostUsd.toFixed(3)}
        </span>
      </div>
    </header>
  );
}
