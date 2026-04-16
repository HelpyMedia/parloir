"use client";

type Mode = "brainstorm" | "decide" | "research";

const MODES: Array<{ id: Mode; label: string; blurb: string; enabled: boolean }> = [
  { id: "brainstorm", label: "Brainstorm", blurb: "Generate options", enabled: false },
  { id: "decide", label: "Decide", blurb: "Pick the best path", enabled: true },
  { id: "research", label: "Research", blurb: "Validate with sources", enabled: false },
];

export function ModeSelector({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Mode
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map((m) => {
          const active = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              disabled={!m.enabled}
              onClick={() => m.enabled && onChange(m.id)}
              aria-pressed={active}
              className="cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
              style={{
                borderColor: active ? "var(--color-spot-warm)" : "var(--color-border-subtle)",
                backgroundColor: active ? "var(--color-spot-halo)" : "var(--color-surface-card)",
              }}
            >
              <div
                className="font-display text-base"
                style={{
                  color: active ? "var(--color-spot-warm)" : "var(--color-text-primary)",
                }}
              >
                {m.label}
              </div>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                {m.enabled ? m.blurb : "soon"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type { Mode };
