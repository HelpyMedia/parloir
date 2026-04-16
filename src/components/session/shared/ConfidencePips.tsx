type Confidence = "low" | "medium" | "high" | null;

const FILLED: Record<Exclude<Confidence, null>, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

export function ConfidencePips({ level }: { level: Confidence }) {
  const filled = level ? FILLED[level] : 0;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Confidence ${level ?? "unknown"}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-2 rounded-sm"
          style={{
            backgroundColor:
              i < filled ? "var(--color-text-primary)" : "var(--color-border-subtle)",
          }}
        />
      ))}
    </span>
  );
}
