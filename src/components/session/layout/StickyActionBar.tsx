"use client";

import { Download, Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Phase } from "@/lib/orchestrator/types";

interface Props {
  phase: Phase;
  pausePending: boolean;
  onPauseToggle: () => void;
  onExport: () => void;
  canExport: boolean;
  /** Shown when the session failed: start a fresh session with the same question. */
  onRetry?: () => void;
}

export function StickyActionBar({
  phase,
  pausePending,
  onPauseToggle,
  onExport,
  canExport,
  onRetry,
}: Props) {
  const t = useTranslations("Session");
  const isPaused = phase === "paused";
  const isFailed = phase === "failed";
  const isCompleted = phase === "completed" || isFailed;

  const pauseLabel = pausePending ? t("pausing") : isPaused ? t("resume") : t("pause");
  const pauseIcon = pausePending ? (
    <Loader2 className="h-4 w-4 animate-spin" />
  ) : isPaused ? (
    <Play className="h-4 w-4" />
  ) : (
    <Pause className="h-4 w-4" />
  );

  return (
    <footer className="sticky bottom-0 z-30 flex h-16 items-center justify-between gap-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 sm:px-6">
      <div className="flex items-center gap-2">
        {!isCompleted && (
          <ActionButton
            onClick={onPauseToggle}
            disabled={pausePending}
            icon={pauseIcon}
            label={pauseLabel}
          />
        )}
        {isFailed && onRetry && (
          <ActionButton
            onClick={onRetry}
            icon={<RotateCcw className="h-4 w-4" />}
            label={t("retry")}
          />
        )}
      </div>
      <ActionButton
        onClick={onExport}
        disabled={!canExport}
        icon={<Download className="h-4 w-4" />}
        label={t("export")}
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
