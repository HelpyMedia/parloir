interface Props {
  turnId: string;
  label?: string;
  onJump?: (turnId: string) => void;
}

export function ReferenceChip({ turnId, label, onJump }: Props) {
  return (
    <button
      type="button"
      onClick={() => onJump?.(turnId)}
      className="inline-flex cursor-pointer items-center gap-1 rounded border border-[var(--color-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-evidence)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
    >
      <span aria-hidden>↗</span>
      {label ?? turnId.slice(0, 6)}
    </button>
  );
}
