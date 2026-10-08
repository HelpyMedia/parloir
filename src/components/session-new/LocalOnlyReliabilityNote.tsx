import { useTranslations } from "next-intl";

export function LocalOnlyReliabilityNote() {
  const t = useTranslations("NewSession");
  return (
    <div className="rounded-lg border border-[var(--color-spot-warm)]/40 bg-[var(--color-spot-halo)]/30 p-3 text-xs text-[var(--color-text-muted)]">
      <div className="mb-1 font-mono uppercase tracking-wide text-[var(--color-spot-warm)]">
        {t("localNoteTitle")}
      </div>
      <p>{t("localNoteBody")}</p>
    </div>
  );
}
