"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";

interface Props {
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}

export function StartButton({ disabled, busy, onClick }: Props) {
  const t = useTranslations("NewSession");
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      onClick={(e) => {
        // The form's onSubmit already starts the session; avoid a double start.
        e.preventDefault();
        onClick();
      }}
      className="inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-6 py-3 font-display text-base text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-warm)]/30 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
    >
      <Play className="h-4 w-4" />
      {busy ? t("starting") : t("start")}
    </button>
  );
}
