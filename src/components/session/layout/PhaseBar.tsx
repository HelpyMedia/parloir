import type { Phase } from "@/lib/orchestrator/types";

const ORDER: Array<{ key: Phase; label: string }> = [
  { key: "opening", label: "Opening" },
  { key: "critique", label: "Critique" },
  { key: "consensus_check", label: "Consensus" },
  { key: "adaptive_round", label: "Adaptive" },
  { key: "synthesis", label: "Synthesis" },
  { key: "completed", label: "Final" },
];

function phaseIndex(phase: Phase): number {
  const idx = ORDER.findIndex((p) => p.key === phase);
  return idx >= 0 ? idx : 0;
}

export function PhaseBar({ phase }: { phase: Phase }) {
  const current = phaseIndex(phase);
  return (
    <nav
      aria-label="Debate phase"
      className="flex h-12 items-center gap-1 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-6"
    >
      {ORDER.map((step, i) => {
        const state = i < current ? "done" : i === current ? "active" : "future";
        return (
          <div key={step.key} className="flex items-center gap-1">
            <span
              className="font-mono text-[11px] uppercase tracking-wide transition-colors"
              style={{
                color:
                  state === "active"
                    ? "var(--color-spot-warm)"
                    : state === "done"
                      ? "var(--color-text-muted)"
                      : "var(--color-text-dim)",
              }}
            >
              {step.label}
            </span>
            {i < ORDER.length - 1 && (
              <span
                className="mx-2 inline-block h-px w-8"
                style={{
                  backgroundColor:
                    state === "future" ? "var(--color-border-subtle)" : "var(--color-border-strong)",
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
