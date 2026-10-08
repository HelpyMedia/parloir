"use client";

import { useTranslations } from "next-intl";
import type { Persona } from "@/lib/orchestrator/types";
import { PersonaAvatar } from "../session/shared/PersonaAvatar";
import { accentVar } from "@/lib/session-ui/persona-accent";
import { ModelPicker } from "../models/ModelPicker";
import type { PickerModel } from "../models/useModelCatalog";

interface Props {
  personas: Persona[];
  selected: string[];
  seatModels: Record<string, string>;
  models: PickerModel[];
  modelsLoading: boolean;
  freeOnly: boolean;
  onToggle: (personaId: string) => void;
  onModel: (personaId: string, modelId: string) => void;
  highlightedIds?: Set<string>;
}

export function PersonaChecklist({
  personas,
  selected,
  seatModels,
  models,
  modelsLoading,
  freeOnly,
  onToggle,
  onModel,
  highlightedIds,
}: Props) {
  const t = useTranslations("NewSession");
  const tPicker = useTranslations("ModelPicker");
  const tRole = useTranslations("Personas");
  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        {t("personasLabel")}
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {personas.map((p) => {
          const checked = selected.includes(p.id);
          const highlighted = highlightedIds?.has(p.id) ?? false;
          return (
            <div
              key={`${p.id}-${highlighted ? "h" : "n"}`}
              className={
                "flex flex-col gap-2 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--color-spot-warm)]" +
                (highlighted ? " parloir-suggest-row-glow" : "")
              }
              style={{
                borderColor: checked ? "var(--color-spot-warm)" : "var(--color-border-subtle)",
                backgroundColor: checked ? "var(--color-spot-halo)" : "var(--color-surface-card)",
              }}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(p.id)}
                  className="sr-only"
                />
                <PersonaAvatar personaId={p.id} name={p.name} size="md" active={checked} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-base" style={{ color: accentVar(p.id) }}>
                    {p.name}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                    {tRole.has(p.id) ? tRole(p.id) : p.role}
                  </div>
                </div>
              </label>
              {checked && (
                <ModelPicker
                  compact
                  label={tPicker("change", { name: p.name })}
                  value={seatModels[p.id] ?? null}
                  models={models}
                  loading={modelsLoading}
                  freeOnlyDefault={freeOnly}
                  onChange={(id) => onModel(p.id, id)}
                />
              )}
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
