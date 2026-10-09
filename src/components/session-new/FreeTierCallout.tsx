"use client";

import { useTranslations } from "next-intl";
import { formatEstimate } from "@/lib/models/cost-estimate";
import type { CreditState } from "./useOpenRouterCredit";

/**
 * Free models share capacity with everyone on OpenRouter, so a Free debate
 * is a way to try Parloir, not the best of it. Say so up front and make the
 * step to a reliable panel one click (or one top-up) away.
 */
export function FreeTierCallout({
  credit,
  lowCost,
  onUseLow,
}: {
  credit: CreditState;
  /** Typical Low cost debate with this panel size and depth; null while loading. */
  lowCost: number | null;
  onUseLow: () => void;
}) {
  const t = useTranslations("NewSession");
  const cost = lowCost === null ? "…" : formatEstimate(lowCost);
  return (
    <div className="space-y-1.5 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-2.5 text-xs text-[var(--color-text-muted)]">
      <p>{t("freeTierCallout")}</p>
      {credit === "credit" ? (
        <button
          type="button"
          onClick={onUseLow}
          className="cursor-pointer text-[var(--color-spot-warm)] underline underline-offset-2"
        >
          {t("freeTierUseLow", { cost })}
        </button>
      ) : (
        <p>
          {t("freeTierAddCredit", { cost })}{" "}
          <a
            href="https://openrouter.ai/settings/credits"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-spot-warm)] underline underline-offset-2"
          >
            {t("noCreditLink")}
          </a>
        </p>
      )}
    </div>
  );
}
