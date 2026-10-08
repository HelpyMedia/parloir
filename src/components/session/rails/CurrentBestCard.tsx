import { useTranslations } from "next-intl";
interface Props {
  value: string | null;
}

export function CurrentBestCard({ value }: Props) {
  const t = useTranslations("Council");
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {t("currentBest")}
      </div>
      <p className="mt-1.5 font-display text-base leading-snug text-[var(--color-text-primary)]">
        {value || <span className="text-[var(--color-text-dim)]">{t("forming")}</span>}
      </p>
    </div>
  );
}
