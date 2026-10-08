import { useTranslations } from "next-intl";
import type { Phase } from "@/lib/orchestrator/types";

export function PhaseDivider({ phase, round }: { phase: Phase; round: number }) {
  const t = useTranslations("Council");
  const base = t.has(`divider_${phase}`) ? t(`divider_${phase}`) : t(`phase_${phase}`);
  const label =
    phase === "critique" || phase === "adaptive_round" ? `${base} · ${t("round", { n: round })}` : base;

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
