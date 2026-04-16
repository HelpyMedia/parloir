import { Sparkles } from "lucide-react";
import type { ConsensusReport } from "@/lib/orchestrator/types";

export function ConsensusCard({ report }: { report: ConsensusReport }) {
  const pct = Math.round(report.consensusLevel * 100);
  return (
    <aside className="rounded-lg border border-[var(--color-evidence)]/50 bg-[var(--color-surface-card)] p-4">
      <header className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[var(--color-evidence)]" />
        <span className="font-display text-base text-[var(--color-evidence)]">
          Consensus check
        </span>
        <span className="ml-auto font-mono text-xs text-[var(--color-text-muted)]">
          {pct}% alignment
        </span>
      </header>

      <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
        {report.majorityPosition}
      </p>

      {report.minorityPositions.length > 0 && (
        <div className="mt-3 space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
            Minority views
          </div>
          {report.minorityPositions.map((m, i) => (
            <p key={i} className="text-xs text-[var(--color-dissent)]">
              {m.position}
            </p>
          ))}
        </div>
      )}

      {report.unresolvedQuestions.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-[var(--color-text-muted)]">
          {report.unresolvedQuestions.map((q, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-[var(--color-evidence)]">?</span>
              {q}
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
