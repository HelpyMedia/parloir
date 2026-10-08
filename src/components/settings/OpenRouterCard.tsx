"use client";

import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ProviderForm } from "./ProviderForm";

interface Status {
  connected: boolean;
  valid?: boolean | null;
  freeTier?: boolean | null;
  limitRemaining?: number | null;
  usageToday?: number | null;
}

const usd = (n: number, locale: string) =>
  new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);

/**
 * OpenRouter is the main way in: one click to connect via OAuth, with
 * key pasting as a fallback for people who already have one.
 */
export function OpenRouterCard({
  connected,
  onChange,
}: {
  connected: boolean;
  onChange: (connected: boolean) => void;
}) {
  const t = useTranslations("Settings");
  const locale = useLocale();
  const [pasting, setPasting] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!connected) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    fetch("/api/credentials/openrouter/status")
      .then((r) => (r.ok ? (r.json() as Promise<Status>) : null))
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [connected]);

  if (connected || pasting) {
    return (
      <div className="flex flex-col gap-2">
        <ProviderForm
          kind="cloud"
          provider="openrouter"
          name={t("orTitle")}
          hint={t("orHint")}
          connected={connected}
          onConnected={() => {
            setPasting(false);
            onChange(true);
          }}
          onDisconnected={() => onChange(false)}
        />
        {connected && status && (
          <div className="flex flex-col gap-1 px-1 text-xs text-[var(--color-text-muted)]">
            {status.valid === false && <p className="text-[var(--color-danger)]">{t("orInvalid")}</p>}
            {status.valid && status.freeTier && <p>{t("orFreeTier")}</p>}
            {status.valid && status.freeTier === false && status.usageToday !== null && status.usageToday !== undefined && (
              <p>{t("orPaid", { today: usd(status.usageToday, locale) })}</p>
            )}
            {status.valid && typeof status.limitRemaining === "number" && (
              <p>{t("orRemaining", { remaining: usd(status.limitRemaining, locale) })}</p>
            )}
          </div>
        )}
        {connected && (
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-1 text-xs text-[var(--color-text-muted)] underline hover:text-[var(--color-spot-warm)]"
          >
            {t("orManage")} <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-surface-card)] p-4">
      <div className="flex flex-col gap-1">
        <span className="font-display text-base text-[var(--color-text-primary)]">{t("orTitle")}</span>
        <span className="text-xs text-[var(--color-text-muted)]">{t("orHint")}</span>
      </div>
      <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
        {/* A plain link: the connect route redirects to openrouter.ai. */}
        <a
          href={`/api/openrouter/connect?locale=${locale}`}
          className="rounded bg-[var(--color-spot-warm)] px-4 py-2 font-mono text-xs uppercase tracking-wide text-[var(--color-bg-chamber)] transition-opacity hover:opacity-90"
        >
          {t("orConnect")}
        </a>
        <button
          type="button"
          onClick={() => setPasting(true)}
          className="text-xs text-[var(--color-text-muted)] underline hover:text-[var(--color-spot-warm)]"
        >
          {t("orPaste")}
        </button>
      </div>
    </div>
  );
}
