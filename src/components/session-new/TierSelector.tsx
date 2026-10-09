"use client";

import { useTranslations } from "next-intl";
import { MODEL_TIERS, type ModelTier } from "@/lib/models/tiers";
import { formatEstimate } from "@/lib/models/cost-estimate";

const LABELS: Record<ModelTier, { label: string; blurb: string }> = {
  free: { label: "tierFree", blurb: "tierFreeBlurb" },
  low: { label: "tierLow", blurb: "tierLowBlurb" },
  medium: { label: "tierMedium", blurb: "tierMediumBlurb" },
  high: { label: "tierHigh", blurb: "tierHighBlurb" },
};

/**
 * Pick a class of models instead of hunting through the catalog. Each card
 * shows what a typical debate costs in that tier at the chosen depth.
 */
export function TierSelector({
  value,
  onChange,
  estimates,
  paidDisabled,
}: {
  value: ModelTier;
  onChange: (tier: ModelTier) => void;
  /** Typical cost per debate for each tier's default panel; null while loading. */
  estimates: Record<ModelTier, number | null>;
  /** The OpenRouter account has no credit, so only free models can answer. */
  paidDisabled: boolean;
}) {
  const t = useTranslations("NewSession");
  return (
    <div className="space-y-2">
      <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        {t("tierLabel")}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MODEL_TIERS.map((tier) => {
          const active = value === tier;
          const disabled = paidDisabled && tier !== "free";
          const estimate = estimates[tier];
          return (
            <button
              key={tier}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(tier)}
              className="cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)] disabled:cursor-not-allowed disabled:opacity-45"
              style={{
                borderColor: active ? "var(--color-spot-warm)" : "var(--color-border-subtle)",
                backgroundColor: active ? "var(--color-spot-halo)" : "var(--color-surface-card)",
              }}
            >
              <div
                className="font-display text-base"
                style={{ color: active ? "var(--color-spot-warm)" : "var(--color-text-primary)" }}
              >
                {t(LABELS[tier].label)}
              </div>
              <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t(LABELS[tier].blurb)}</div>
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                {estimate === null ? "…" : t("tierEstimate", { cost: formatEstimate(estimate) })}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
