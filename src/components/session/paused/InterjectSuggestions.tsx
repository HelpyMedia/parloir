"use client";

import { useTranslations } from "next-intl";
const SUGGESTIONS = ["suggestion1", "suggestion2", "suggestion3"] as const;

export function InterjectSuggestions({ onPick }: { onPick: (text: string) => void }) {
  const t = useTranslations("Council");
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((key) => {
        const s = t(key);
        return (
        <button
          key={key}
          type="button"
          onClick={() => onPick(s)}
          className="cursor-pointer rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
        >
          {s}
        </button>
        );
      })}
    </div>
  );
}
