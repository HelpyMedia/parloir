"use client";

import { useTranslations } from "next-intl";
import type { Persona } from "@/lib/orchestrator/types";
import type { UIPersonaState } from "@/lib/session-ui/types";
import type { PickerModel } from "@/components/models/useModelCatalog";
import { PersonaCard } from "./PersonaCard";
import { SeatEditor } from "./SeatEditor";

/** Present while the debate is paused: lets the person fix the panel. */
export interface RailEditing {
  models: PickerModel[];
  loading: boolean;
  /** Error code per panelist whose model just failed. */
  failed: Record<string, string>;
  canRemove: boolean;
  busyId: string | null;
  onModel: (personaId: string, modelId: string) => void;
  onRemove: (personaId: string) => void;
}

interface Props {
  personas: Persona[];
  personaState: Record<string, UIPersonaState>;
  onSelect?: (personaId: string) => void;
  models?: Record<string, string>;
  removedIds?: string[];
  editing?: RailEditing | null;
}

export function PersonaRail({ personas, personaState, onSelect, models, removedIds = [], editing }: Props) {
  const t = useTranslations("Council");
  const tErr = useTranslations("Errors");
  return (
    <aside
      aria-label={t("councilLabel")}
      className="hidden w-60 shrink-0 flex-col gap-3 border-r lg:flex border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 py-4"
    >
      <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {t("council")}
      </div>
      {editing && <p className="text-xs text-[var(--color-text-muted)]">{t("railEditHint")}</p>}
      <div className="flex flex-col gap-3">
        {personas.map((p) => {
          const state = personaState[p.id] ?? {
            personaId: p.id,
            status: "waiting" as const,
            stance: null,
            confidence: null,
            silenced: false,
          };
          const removed = removedIds.includes(p.id);
          const failedCode = editing?.failed[p.id];
          return (
            <div
              key={p.id}
              className="space-y-2 rounded-lg"
              style={{
                opacity: removed ? 0.45 : 1,
                outline: failedCode ? "1px solid var(--color-danger)" : undefined,
                outlineOffset: failedCode ? 2 : undefined,
              }}
            >
              <PersonaCard persona={p} state={state} model={models?.[p.id]} onSelect={onSelect} />
              {removed && (
                <p className="px-1 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                  {t("removedFromPanel")}
                </p>
              )}
              {editing && !removed && (
                <div className="space-y-1.5 px-1">
                  {failedCode && (
                    <p className="text-xs text-[var(--color-danger)]">
                      {tErr.has(failedCode) ? tErr(failedCode) : tErr("turnFailed")}
                    </p>
                  )}
                  <SeatEditor
                    personaName={p.name}
                    model={models?.[p.id] ?? ""}
                    models={editing.models}
                    loading={editing.loading}
                    canRemove={editing.canRemove}
                    busy={editing.busyId === p.id}
                    onModel={(m) => editing.onModel(p.id, m)}
                    onRemove={() => editing.onRemove(p.id)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
