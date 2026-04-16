interface Props {
  stance: string | null;
  tone?: "neutral" | "supporting" | "opposing";
}

const TONE = {
  neutral: "text-[var(--color-text-muted)] border-[var(--color-border-subtle)]",
  supporting: "text-[var(--color-consensus)] border-[var(--color-consensus)]",
  opposing: "text-[var(--color-dissent)] border-[var(--color-dissent)]",
} as const;

export function StanceChip({ stance, tone = "neutral" }: Props) {
  if (!stance) {
    return (
      <span className="inline-flex rounded border border-[var(--color-border-subtle)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        pending
      </span>
    );
  }
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${TONE[tone]}`}>
      {stance}
    </span>
  );
}
