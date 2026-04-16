"use client";

import { Download, Pause, Play, Send, Sparkles } from "lucide-react";
import type { Phase } from "@/lib/orchestrator/types";

interface Props {
  phase: Phase;
  onPauseToggle: () => void;
  onInterject: () => void;
  onAskRound: () => void;
  onExport: () => void;
  canExport: boolean;
}

export function StickyActionBar({
  phase,
  onPauseToggle,
  onInterject,
  onAskRound,
  onExport,
  canExport,
}: Props) {
  const isPaused = phase === "paused";
  const isCompleted = phase === "completed" || phase === "failed";

  return (
    <footer className="sticky bottom-0 flex h-16 items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-6">
      <div className="flex items-center gap-2">
        <ActionButton
          onClick={onPauseToggle}
          disabled={isCompleted}
          icon={isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          label={isPaused ? "Resume" : "Pause"}
        />
        <ActionButton
          onClick={onInterject}
          disabled={isCompleted}
          icon={<Send className="h-4 w-4" />}
          label="Interject"
        />
        <ActionButton
          onClick={onAskRound}
          disabled={isCompleted}
          icon={<Sparkles className="h-4 w-4" />}
          label="Ask another round"
        />
      </div>
      <ActionButton
        onClick={onExport}
        disabled={!canExport}
        icon={<Download className="h-4 w-4" />}
        label="Export"
        variant="primary"
      />
    </footer>
  );
}

function ActionButton({
  onClick,
  disabled,
  icon,
  label,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  variant?: "default" | "primary";
}) {
  const base =
    "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-chamber)] disabled:cursor-not-allowed disabled:opacity-40";
  const tone =
    variant === "primary"
      ? "border-[var(--color-spot-warm)] text-[var(--color-spot-warm)] hover:bg-[var(--color-spot-halo)]"
      : "border-[var(--color-border-subtle)] text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-card)]";

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${tone}`}>
      {icon}
      {label}
    </button>
  );
}
