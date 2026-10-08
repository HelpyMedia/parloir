"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatContext, formatPrice, type PickerModel } from "./useModelCatalog";

interface Props {
  value: string | null;
  models: PickerModel[];
  onChange: (modelId: string) => void;
  /** Label for the dialog and the trigger's accessible name. */
  label: string;
  /** Start the dialog with "Free only" on. */
  freeOnlyDefault?: boolean;
  /** Offer an "Auto" choice that maps to "". */
  allowAuto?: boolean;
  loading?: boolean;
  compact?: boolean;
}

const MAX_ROWS = 150;

function byQuality(a: PickerModel, b: PickerModel) {
  const ai = a.intelligence ?? -1;
  const bi = b.intelligence ?? -1;
  if (ai !== bi) return bi - ai;
  return b.created - a.created;
}

export function ModelPicker({
  value,
  models,
  onChange,
  label,
  freeOnlyDefault = false,
  allowAuto = false,
  loading = false,
  compact = false,
}: Props) {
  const t = useTranslations("ModelPicker");
  const tNew = useTranslations("NewSession");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [freeOnly, setFreeOnly] = useState(freeOnlyDefault);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const selected = value ? models.find((m) => m.id === value) ?? null : null;

  useEffect(() => {
    if (!open) return;
    setFreeOnly(freeOnlyDefault);
    setQuery("");
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, freeOnlyDefault]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return models
      .filter((m) => !freeOnly || m.isFree)
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
      // Refused models stay visible (so people see why theirs vanished) but sink to the bottom.
      .sort((a, b) => Number(Boolean(a.restricted)) - Number(Boolean(b.restricted)) || byQuality(a, b));
  }, [models, query, freeOnly]);

  const pick = (id: string) => {
    onChange(id);
    close();
  };

  const triggerText = selected
    ? selected.name
    : value === "" && allowAuto
      ? tNew("auto")
      : value
        ? value.replace(/^openrouter\//, "")
        : loading
          ? t("loading")
          : t("noModel");

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-label={`${label}: ${triggerText}`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          "flex w-full items-center justify-between gap-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-raised)] text-left font-mono text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-spot-warm)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)] " +
          (compact ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-xs")
        }
      >
        <span className="min-w-0 truncate">{triggerText}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {selected?.isFree && (
            <span className="rounded bg-[var(--color-spot-halo)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-spot-warm)]">
              {t("free")}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-[var(--color-text-dim)]" aria-hidden />
        </span>
      </button>

      {open &&
        createPortal(
        // Portal: keeps the dialog out of the persona <label>, whose native
        // click activation would otherwise toggle the panelist.
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-xl border border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] shadow-2xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] px-4 py-3">
              <h2 id={titleId} className="font-display text-base text-[var(--color-text-primary)]">
                {label}
              </h2>
              <button
                type="button"
                onClick={close}
                aria-label={t("close")}
                className="rounded p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2 border-b border-[var(--color-border-subtle)] px-4 py-3">
              <label className="relative block">
                <span className="sr-only">{t("search")}</span>
                <Search
                  className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-dim)]"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("search")}
                  className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] py-2 pl-8 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-spot-warm)] focus:outline-none"
                />
              </label>
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={freeOnly}
                    onChange={(e) => setFreeOnly(e.target.checked)}
                    className="accent-[var(--color-spot-warm)]"
                  />
                  {t("freeOnly")}
                </label>
                <span>{t("count", { count: filtered.length })}</span>
              </div>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox" aria-label={label}>
              {allowAuto && (
                <ModelRow
                  active={value === ""}
                  title={tNew("auto")}
                  meta={tNew("advancedHint")}
                  onPick={() => pick("")}
                />
              )}
              {filtered.slice(0, MAX_ROWS).map((m) => (
                <ModelRow
                  key={m.id}
                  active={m.id === value}
                  title={m.name}
                  badge={m.restricted ? t("restricted") : m.reliability === "flaky" ? t("flaky") : m.isFree ? t("free") : null}
                  badgeTone={m.restricted || m.reliability === "flaky" ? "warn" : "default"}
                  disabled={m.restricted}
                  meta={[
                    m.restricted ? t("restrictedHint") : null,
                    m.isFree || m.promptPerM === null
                      ? null
                      : t("perMillion", { in: formatPrice(m.promptPerM), out: formatPrice(m.completionPerM) }),
                    m.contextLength ? t("context", { tokens: formatContext(m.contextLength) }) : null,
                    m.provider !== "openrouter" ? m.provider : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  onPick={() => pick(m.id)}
                />
              ))}
              {filtered.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">{t("noResults")}</li>
              )}
            </ul>
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}

function ModelRow({
  active,
  title,
  meta,
  badge = null,
  badgeTone = "default",
  disabled = false,
  onPick,
}: {
  active: boolean;
  title: string;
  meta: string;
  badge?: string | null;
  badgeTone?: "default" | "warn";
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <li role="option" aria-selected={active} aria-disabled={disabled || undefined}>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--color-surface-card)] focus-visible:bg-[var(--color-surface-card)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <Check
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: active ? "var(--color-spot-warm)" : "transparent" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm text-[var(--color-text-primary)]">{title}</span>
            {badge && (
              <span
                className={
                  badgeTone === "warn"
                    ? "shrink-0 rounded bg-[var(--color-danger)]/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-danger)]"
                    : "shrink-0 rounded bg-[var(--color-spot-halo)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-[var(--color-spot-warm)]"
                }
              >
                {badge}
              </span>
            )}
          </span>
          {meta && (
            <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-text-dim)]">{meta}</span>
          )}
        </span>
      </button>
    </li>
  );
}
