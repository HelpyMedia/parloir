interface Props {
  count: number;
}

export function SourcesCard({ count }: Props) {
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          Sources used
        </div>
        <div className="font-display text-xl leading-none text-[var(--color-evidence)]">
          {count}
        </div>
      </div>
    </div>
  );
}
