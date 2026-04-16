interface Props {
  value: string | null;
}

export function KeyTensionCard({ value }: Props) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        Key tension
      </div>
      <p className="mt-1.5 text-sm leading-snug text-[var(--color-dissent)]">
        {value ?? <span className="text-[var(--color-text-dim)]">None surfaced yet</span>}
      </p>
    </div>
  );
}
