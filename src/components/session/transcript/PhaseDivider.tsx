import type { Phase } from "@/lib/orchestrator/types";

const LABEL: Record<Phase, string> = {
  setup: "Setup",
  opening: "Opening statements",
  critique: "Critique",
  consensus_check: "Consensus check",
  adaptive_round: "Adaptive round",
  synthesis: "Synthesis",
  completed: "Completed",
  paused: "Paused",
  failed: "Failed",
};

export function PhaseDivider({ phase, round }: { phase: Phase; round: number }) {
  const label =
    phase === "critique" || phase === "adaptive_round"
      ? `${LABEL[phase]} · round ${round}`
      : LABEL[phase];

  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--color-border-subtle)]" />
    </div>
  );
}
