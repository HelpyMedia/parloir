import type { SynthesisArtifact } from "@/lib/orchestrator/types";

export function KeyArgumentsList({ artifact }: { artifact: SynthesisArtifact }) {
  if (artifact.keyArguments.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Why this wins
      </h2>
      <ul className="space-y-2">
        {artifact.keyArguments.map((arg, i) => (
          <li
            key={i}
            className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3"
          >
            <p className="text-sm leading-relaxed text-[var(--color-text-primary)]">
              {arg.position}
            </p>
            {arg.proponents.length > 0 && (
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                supported by {arg.proponents.join(", ")}
              </div>
            )}
          </li>
        ))}
      </ul>
      {artifact.tradeoffs.length > 0 && (
        <ul className="ml-4 list-disc space-y-1 text-sm text-[var(--color-text-muted)]">
          {artifact.tradeoffs.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
