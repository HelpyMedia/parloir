import type { SynthesisArtifact } from "@/lib/orchestrator/types";

export function NextActionsList({ artifact }: { artifact: SynthesisArtifact }) {
  if (artifact.recommendedActions.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Recommended next actions
      </h2>
      <ol className="space-y-2">
        {artifact.recommendedActions.map((action, i) => (
          <li
            key={i}
            className="flex gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3"
          >
            <span className="font-mono text-xs text-[var(--color-spot-warm)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-sm leading-relaxed text-[var(--color-text-primary)]">
              {action}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
