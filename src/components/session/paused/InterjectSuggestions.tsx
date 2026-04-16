"use client";

const SUGGESTIONS = [
  "Ask the skeptic to pressure-test the top option",
  "Ask the researcher to validate one assumption",
  "Ask the moderator to summarize the disagreement",
];

export function InterjectSuggestions({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {SUGGESTIONS.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          className="cursor-pointer rounded-full border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
