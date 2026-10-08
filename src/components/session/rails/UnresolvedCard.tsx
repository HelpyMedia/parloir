import { useTranslations } from "next-intl";
interface Props {
  items: string[];
}

export function UnresolvedCard({ items }: Props) {
  const t = useTranslations("Council");
  return (
    <div className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3">
      <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {t("unresolved")}
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-sm text-[var(--color-text-dim)]">{t("nothingOpen")}</p>
      ) : (
        <ul className="mt-1.5 space-y-1 text-sm text-[var(--color-text-primary)]">
          {items.slice(0, 4).map((item, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-[var(--color-evidence)]">›</span>
              <span className="leading-snug">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
