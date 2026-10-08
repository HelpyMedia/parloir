"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

export function DeleteAccount({ email }: { email: string }) {
  const t = useTranslations("Settings");
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      if (!r.ok) throw new Error(t("deleteFailed"));
      window.location.assign("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-danger)]/40 p-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-display text-lg text-[var(--color-text-primary)]">{t("deleteTitle")}</h2>
        <p className="text-xs text-[var(--color-text-muted)]">{t("deleteBody")}</p>
      </div>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="self-start rounded border border-[var(--color-danger)]/60 px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
        >
          {t("deleteButton")}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-[var(--color-text-muted)]" htmlFor="confirm-email">
            {t("deleteConfirm", { email })}
          </label>
          <input
            id="confirm-email"
            type="email"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] px-3 py-2 font-mono text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--color-danger)]"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || typed.trim() !== email}
              onClick={handleDelete}
              className="rounded bg-[var(--color-danger)] px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-bg-chamber)] disabled:opacity-40"
            >
              {busy ? "…" : t("deleteForever")}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setTyped("");
              }}
              className="px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)]"
            >
              {t("cancel")}
            </button>
          </div>
          {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
        </div>
      )}
    </section>
  );
}
