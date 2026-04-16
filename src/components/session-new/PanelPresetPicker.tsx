"use client";

export function PanelPresetPicker() {
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Panel preset
      </div>
      <div
        className="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-2.5 text-sm opacity-60"
        aria-disabled
      >
        <span className="text-[var(--color-text-muted)]">Mixed council (default)</span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          coming soon
        </span>
      </div>
    </div>
  );
}
