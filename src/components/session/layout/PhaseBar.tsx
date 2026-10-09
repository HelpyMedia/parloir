"use client";

import { useTranslations } from "next-intl";
import type { Phase } from "@/lib/orchestrator/types";

const ORDER: Array<{ key: Phase; label: string }> = [
  { key: "research", label: "phaseResearch" },
  { key: "opening", label: "phaseOpening" },
  { key: "critique", label: "phaseCritique" },
  { key: "consensus_check", label: "phaseConsensus" },
  { key: "adaptive_round", label: "phaseAdaptive" },
  { key: "synthesis", label: "phaseSynthesis" },
  { key: "completed", label: "phaseFinal" },
];

function phaseIndex(phase: Phase): number {
  // A failed session highlights nothing rather than pretending to be at "Opening".
  if (phase === "failed") return -1;
  const idx = ORDER.findIndex((p) => p.key === phase);
  return idx >= 0 ? idx : 0;
}

export function PhaseBar({ phase }: { phase: Phase }) {
  const t = useTranslations("Session");
  const current = phaseIndex(phase);
  return (
    <nav
      aria-label={t("phaseNavLabel")}
      className="flex h-12 items-center gap-1 overflow-x-auto whitespace-nowrap border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 sm:px-6"
    >
      {ORDER.map((step, i) => {
        const state = current < 0 ? "future" : i < current ? "done" : i === current ? "active" : "future";
        return (
          <div key={step.key} className="flex shrink-0 items-center gap-1">
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
              {t(step.label)}
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
