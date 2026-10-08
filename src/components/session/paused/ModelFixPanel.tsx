"use client";

import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import type { ModelFixSeat, Persona } from "@/lib/orchestrator/types";
import type { RailEditing } from "../rails/PersonaRail";
import { SeatEditor } from "../rails/SeatEditor";

/**
 * Shown in the stage while the debate waits for failed models to be fixed.
 * Carries the same controls as the left rail so it also works on phones,
 * where the rail is hidden.
 */
export function ModelFixPanel({
  seats,
  personas,
  models,
  removedIds,
  editing,
  resumePending,
  error,
  onResume,
}: {
  seats: ModelFixSeat[];
  personas: Persona[];
  models: Record<string, string>;
  removedIds: string[];
  editing: RailEditing;
  resumePending: boolean;
  error: string | null;
  onResume: () => void;
}) {
  const t = useTranslations("Council");
  const tErr = useTranslations("Errors");
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-4 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-card)] p-5 shadow-lg">
      <div>
        <p className="font-display text-base text-[var(--color-text-primary)]">{t("modelFixTitle")}</p>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("modelFixBody")}</p>
      </div>
      <ul className="space-y-3">
        {seats.map((s) => {
          const persona = personas.find((p) => p.id === s.personaId);
          const removed = removedIds.includes(s.personaId);
          const current = models[s.personaId] ?? s.modelId;
          const switched = current !== s.modelId;
          return (
            <li key={s.personaId} className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-display text-sm text-[var(--color-text-primary)]">{s.personaName}</span>
                <code className="break-all font-mono text-[10px] text-[var(--color-text-dim)]">
                  {s.modelId.replace(/^openrouter\//, "")}
                </code>
              </div>
              <p className="mt-1 text-xs text-[var(--color-danger)]">
                {tErr.has(s.code) ? tErr(s.code) : tErr("turnFailed")}
              </p>
              <div className="mt-2">
                {removed ? (
                  <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                    {t("removedFromPanel")}
                  </p>
                ) : (
                  <>
                    <SeatEditor
                      personaName={persona?.name ?? s.personaName}
                      model={current}
                      models={editing.models}
                      loading={editing.loading}
                      canRemove={editing.canRemove}
                      busy={editing.busyId === s.personaId}
                      onModel={(m) => editing.onModel(s.personaId, m)}
                      onRemove={() => editing.onRemove(s.personaId)}
                    />
                    {switched && (
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">{t("modelFixSwitched")}</p>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-text-dim)]">{t("modelFixRetryNote")}</p>
        <button
          type="button"
          onClick={onResume}
          disabled={resumePending}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[var(--color-spot-warm)] px-4 py-2 font-mono text-xs uppercase tracking-wide text-[var(--color-bg-chamber)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
        >
          <Play className="h-3.5 w-3.5" aria-hidden />
          {t("resume")}
        </button>
      </div>
    </div>
  );
}
