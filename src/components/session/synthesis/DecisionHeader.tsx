import type { SynthesisArtifact } from "@/lib/orchestrator/types";

const CONFIDENCE_COLOR: Record<SynthesisArtifact["confidence"], string> = {
  high: "var(--color-consensus)",
  medium: "var(--color-evidence)",
  low: "var(--color-dissent)",
};

export function DecisionHeader({ artifact }: { artifact: SynthesisArtifact }) {
  return (
    <header className="relative flex flex-col items-center gap-4 overflow-hidden rounded-2xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-table)] px-10 py-12 text-center">
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
        Final decision · {artifact.confidence} confidence
      </span>
      <h1 className="relative max-w-[60ch] font-display text-3xl leading-tight text-[var(--color-text-primary)] md:text-4xl">
        {artifact.decision}
      </h1>
    </header>
  );
}
