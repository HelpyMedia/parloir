import { useTranslations } from "next-intl";
import type { SynthesisArtifact } from "@/lib/orchestrator/types";

const CONFIDENCE_COLOR: Record<SynthesisArtifact["confidence"], string> = {
  high: "var(--color-consensus)",
  medium: "var(--color-evidence)",
  low: "var(--color-dissent)",
};

export function DecisionHeader({ artifact }: { artifact: SynthesisArtifact }) {
  const t = useTranslations("Council");
  return (
    <header className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-table)] px-5 py-10 text-center sm:px-10 sm:py-12">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--color-spot-halo) 0%, transparent 60%)",
        }}
      />
      <span
        className="relative inline-flex items-center gap-2 rounded-full border px-3 py-0.5 font-mono text-[11px] uppercase tracking-wider"
        style={{
          borderColor: CONFIDENCE_COLOR[artifact.confidence],
          color: CONFIDENCE_COLOR[artifact.confidence],
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: CONFIDENCE_COLOR[artifact.confidence] }}
        />
        {t("finalDecision", { level: t(`confidence_${artifact.confidence}`) })}
      </span>
      <h1 className="relative max-w-[60ch] font-display text-2xl leading-tight sm:text-3xl text-[var(--color-text-primary)] md:text-4xl">
        {artifact.decision}
      </h1>
    </header>
  );
}
