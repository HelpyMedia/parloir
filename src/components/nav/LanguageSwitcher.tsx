"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function switchTo(next: Locale) {
    if (next === locale || pending) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
    });
  }

  return (
    <div className="flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.18em]">
      {routing.locales.map((code, idx) => (
        <span key={code} className="flex items-center">
          {idx > 0 && (
            <span aria-hidden="true" className="mx-1 text-[var(--color-text-dim)]">
              /
            </span>
          )}
          <button
            type="button"
            onClick={() => switchTo(code)}
            disabled={pending || code === locale}
            aria-pressed={code === locale}
            className={
              code === locale
                ? "text-[var(--color-spot-warm)]"
                : "cursor-pointer text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:cursor-not-allowed"
            }
          >
            {code}
          </button>
        </span>
      ))}
    </div>
  );
}
