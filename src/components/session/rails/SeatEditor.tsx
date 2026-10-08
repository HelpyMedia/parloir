"use client";

import { useTranslations } from "next-intl";
import { ModelPicker } from "@/components/models/ModelPicker";
import type { PickerModel } from "@/components/models/useModelCatalog";

/**
 * Switch a panelist's model, or take them off the panel, while the debate is
 * paused. Used under each card in the left rail and in the pause overlay.
 */
export function SeatEditor({
  personaName,
  model,
  models,
  loading,
  canRemove,
  busy,
  onModel,
  onRemove,
}: {
  personaName: string;
  model: string;
  models: PickerModel[];
  loading: boolean;
  /** False when removing would leave fewer than two panelists. */
  canRemove: boolean;
  busy: boolean;
  onModel: (modelId: string) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("Council");
  return (
    <div className="space-y-1.5">
      <ModelPicker
        compact
        label={t("changeModelFor", { name: personaName })}
        value={model}
        models={models}
        loading={loading}
        onChange={(id) => id && id !== model && onModel(id)}
      />
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("removePanelist")}
        </button>
      )}
    </div>
  );
}
