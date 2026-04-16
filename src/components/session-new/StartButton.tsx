"use client";

import { Play } from "lucide-react";

interface Props {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}

export function StartButton({ disabled, busy, onClick }: Props) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-6 py-3 font-display text-base text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-warm)]/30 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
    >
      <Play className="h-4 w-4" />
      {busy ? "Starting…" : "Start session"}
    </button>
  );
}
