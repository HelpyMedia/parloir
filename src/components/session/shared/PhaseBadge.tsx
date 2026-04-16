import type { Phase } from "@/lib/orchestrator/types";

const LABEL: Record<Phase, string> = {
  setup: "Setup",
  opening: "Opening",
  critique: "Critique",
  consensus_check: "Consensus",
  adaptive_round: "Adaptive",
  synthesis: "Synthesis",
  completed: "Completed",
  paused: "Paused",
  failed: "Failed",
};

const ACCENT: Record<Phase, string> = {
  setup: "var(--color-text-muted)",
  opening: "var(--color-persona-strategist)",
  critique: "var(--color-persona-skeptic)",
  consensus_check: "var(--color-evidence)",
  adaptive_round: "var(--color-persona-moderator)",
  synthesis: "var(--color-spot-warm)",
  completed: "var(--color-consensus)",
  paused: "var(--color-text-muted)",
  failed: "var(--color-danger)",
};

export function PhaseBadge({ phase, round }: { phase: Phase; round?: number }) {
  const suffix =
    round !== undefined && (phase === "critique" || phase === "adaptive_round")
      ? ` · R${round}`
      : "";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wide"
      style={{ borderColor: ACCENT[phase], color: ACCENT[phase] }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT[phase] }} />
      {LABEL[phase]}
      {suffix}
    </span>
  );
}
