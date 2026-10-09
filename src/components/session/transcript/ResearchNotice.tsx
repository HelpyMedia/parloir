import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ResearchSkipReason } from "@/lib/orchestrator/types";

const CREDITS_URL = "https://openrouter.ai/settings/credits";

/** The discreet transcript line when the question needed no research. */
export function ResearchNotNeeded() {
  const t = useTranslations("Session");
  return <p className="text-center text-xs text-[var(--color-text-dim)]">{t("researchNotNeeded")}</p>;
}

/**
 * Shown for the life of the session when research couldn't run: the council
 * answered from training data, and the person should know before trusting
 * anything about recent products or prices.
 */
export function ResearchUnavailableNotice({ reason }: { reason: Exclude<ResearchSkipReason, "not_needed"> }) {
  const t = useTranslations("Session");
  const linkClass = "ml-1 underline underline-offset-2 hover:text-[var(--color-text-primary)]";
  return (
    <div
      role="status"
      className="border-b border-[var(--color-evidence)]/40 bg-[var(--color-evidence)]/10 px-6 py-2 text-sm text-[var(--color-text-primary)]"
    >
      {reason === "no_credits" && (
        <>
          {t("researchNoCredits")}
          <a href={CREDITS_URL} target="_blank" rel="noopener noreferrer" className={linkClass}>
            {t("researchNoCreditsLink")}
          </a>
        </>
      )}
      {reason === "no_openrouter_key" && (
        <>
          {t("researchNoKey")}
          <Link href="/settings" className={linkClass}>
            {t("researchNoKeyLink")}
          </Link>
        </>
      )}
      {reason === "failed" && t("researchFailed")}
      {reason === "disabled" && t("researchDisabled")}
    </div>
  );
}
