"use client";

import { useEffect } from "react";

export type SuggestStatus = "idle" | "thinking" | "just-applied";

interface Props {
  status: SuggestStatus;
  disabled: boolean;
  onSuggest: () => void;
  onUndo: () => void;
  onAutoClear: () => void;
}

export function SuggestPanelButton({
  status,
  disabled,
  onSuggest,
  onUndo,
  onAutoClear,
}: Props) {
  // When we enter the just-applied state, auto-clear after 10s unless the
  // parent has already cleared it (e.g. because the user edited a field).
  useEffect(() => {
    if (status !== "just-applied") return;
    const handle = window.setTimeout(onAutoClear, 10_000);
    return () => window.clearTimeout(handle);
  }, [status, onAutoClear]);

  if (status === "just-applied") {
    return (
      <button
        type="button"
        onClick={onUndo}
        className="rounded border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-spot-warm)] transition-colors hover:opacity-90"
      >
        Suggested ✓ — undo
      </button>
    );
  }

  const label = status === "thinking" ? "Thinking…" : "Suggest a panel";
  const isThinking = status === "thinking";

  return (
    <button
      type="button"
      onClick={onSuggest}
      disabled={disabled || isThinking}
      aria-busy={isThinking}
      className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors enabled:hover:border-[var(--color-spot-warm)] enabled:hover:text-[var(--color-spot-warm)] disabled:cursor-not-allowed disabled:opacity-40"
      style={isThinking ? { animation: "parloir-pulse 1.2s ease-in-out infinite" } : undefined}
    >
      {label}
    </button>
  );
}
