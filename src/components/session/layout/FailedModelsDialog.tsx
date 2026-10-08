"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { RotateCcw, X } from "lucide-react";
import type { FailedSeat } from "@/lib/session-ui/types";

/**
 * Shown when a debate stops because panelists' models failed: which panelist,
 * which model, and why, so the person knows exactly what to swap. "Swap and
 * try again" opens the new-session form with those seats already reassigned.
 */
export function FailedModelsDialog({
  seats,
  summary,
  onRetry,
  onClose,
}: {
  seats: FailedSeat[];
  summary: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("Session");
  const tErr = useTranslations("Errors");
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const anyRestricted = seats.some((s) => s.code === "model_restricted");

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] shadow-2xl sm:rounded-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border-subtle)] px-5 py-4">
          <div>
            <h2 id={titleId} className="font-display text-lg text-[var(--color-text-primary)]">
              {t("failedDialogTitle")}
            </h2>
            {summary && <p className="mt-1 text-sm text-[var(--color-danger)]">{summary}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("failedDialogClose")}
            className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <p className="text-sm text-[var(--color-text-muted)]">{t("failedDialogBody")}</p>
          <ul className="mt-4 space-y-3">
            {seats.map((s) => (
              <li
                key={s.personaId}
                className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-display text-base text-[var(--color-text-primary)]">{s.personaName}</span>
                  <code className="break-all font-mono text-[11px] text-[var(--color-text-dim)]">
                    {s.modelId.replace(/^openrouter\//, "")}
                  </code>
                </div>
                <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                  {tErr.has(s.code) ? tErr(s.code) : tErr("turnFailed")}
                </p>
              </li>
            ))}
          </ul>
          {anyRestricted && (
            <p className="mt-4 text-xs text-[var(--color-text-dim)]">{t("failedDialogRestrictedNote")}</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border-subtle)] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-[var(--color-border-subtle)] px-4 py-2 font-mono text-xs uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            {t("failedDialogClose")}
          </button>
          <button
            ref={primaryRef}
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 rounded bg-[var(--color-spot-warm)] px-4 py-2 font-mono text-xs uppercase tracking-wide text-[var(--color-bg-chamber)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-chamber)]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t("failedDialogSwap")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
