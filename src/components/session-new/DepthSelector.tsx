"use client";

export type Depth = "quick" | "standard" | "deep";

export const DEPTH_ROUNDS: Record<Depth, number> = {
  quick: 1,
  standard: 2,
  deep: 4,
};

const OPTIONS: Array<{ id: Depth; label: string; blurb: string }> = [
  { id: "quick", label: "Quick", blurb: "1 critique round" },
  { id: "standard", label: "Standard", blurb: "2 critique rounds" },
  { id: "deep", label: "Deep", blurb: "Up to 4 rounds" },
];

export function DepthSelector({
  value,
  onChange,
}: {
  value: Depth;
  onChange: (d: Depth) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Depth
      </div>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(o.id)}
              className="cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
              style={{
                borderColor: active ? "var(--color-spot-warm)" : "var(--color-border-subtle)",
                backgroundColor: active ? "var(--color-spot-halo)" : "var(--color-surface-card)",
              }}
            >
              <div
                className="font-display text-base"
                style={{ color: active ? "var(--color-spot-warm)" : "var(--color-text-primary)" }}
              >
                {o.label}
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                {o.blurb}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
