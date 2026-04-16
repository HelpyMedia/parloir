interface Props {
  level: number; // 0..1
}

export function ConsensusDial({ level }: Props) {
  const pct = Math.round(Math.max(0, Math.min(1, level)) * 100);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden>
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth="6"
        />
        <circle
          cx="40"
          cy="40"
          r={radius}
          fill="none"
          stroke="var(--color-consensus)"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dashoffset 320ms ease-out" }}
        />
      </svg>
      <div>
        <div className="font-display text-2xl leading-none text-[var(--color-text-primary)]">
          {pct}%
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          alignment
        </div>
      </div>
    </div>
  );
}
