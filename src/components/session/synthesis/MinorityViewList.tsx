import type { SynthesisArtifact } from "@/lib/orchestrator/types";

export function MinorityViewList({ artifact }: { artifact: SynthesisArtifact }) {
  if (artifact.minorityViews.length === 0 && artifact.unresolvedConcerns.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Minority views & open concerns
      </h2>
      <div className="space-y-2">
        {artifact.minorityViews.map((m, i) => (
          <div
            key={i}
            className="rounded-lg border border-[var(--color-dissent)]/40 bg-[var(--color-surface-card)] p-3"
          >
            <p className="text-sm leading-relaxed text-[var(--color-dissent)]">{m.view}</p>
            {m.holders.length > 0 && (
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                held by {m.holders.join(", ")}
              </div>
            )}
          </div>
        ))}
      </div>
      {artifact.unresolvedConcerns.length > 0 && (
        <ul className="ml-4 list-disc space-y-1 text-sm text-[var(--color-text-muted)]">
          {artifact.unresolvedConcerns.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
