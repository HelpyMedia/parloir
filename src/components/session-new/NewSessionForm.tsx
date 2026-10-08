"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Persona } from "@/lib/orchestrator/types";
import { ModelPicker } from "../models/ModelPicker";
import { useModelCatalog, type PickerModel } from "../models/useModelCatalog";
import { DepthSelector, DEPTH_ROUNDS, type Depth } from "./DepthSelector";
import { LocalOnlyReliabilityNote } from "./LocalOnlyReliabilityNote";
import { PersonaChecklist } from "./PersonaChecklist";
import { QuestionInput } from "./QuestionInput";
import { StartButton } from "./StartButton";
import { SuggestPanelButton, type SuggestStatus } from "./SuggestPanelButton";

export interface NewSessionInitial {
  title: string;
  question: string;
  personaIds: string[];
  seatModels: Record<string, string>;
  depth: Depth;
  judgeModel: string;
  synthesizerModel: string;
}

interface Props {
  personas: Persona[];
  connectedProviders: string[];
  hasCloudProvider: boolean;
  initial?: NewSessionInitial | null;
}

interface Snapshot {
  title: string;
  selectedIds: string[];
  seatModels: Record<string, string>;
  depth: Depth;
}

interface PanelSuggestionResponse {
  title: string;
  personaIds: string[];
  overrides: Record<string, string>;
  depth: Depth;
}

/**
 * Give every selected panelist without a usable model the next default from
 * `pool`, never seating the same model twice. Returns the same object when
 * nothing changes so effects don't loop.
 */
function fillSeats(
  selected: string[],
  seats: Record<string, string>,
  pool: string[],
  isUsable: (id: string) => boolean,
): Record<string, string> {
  const next = { ...seats };
  let changed = false;
  const used = new Set(selected.map((id) => next[id]).filter((m) => m && isUsable(m)));
  const spare = pool.filter((id) => !used.has(id));
  for (const personaId of selected) {
    const current = next[personaId];
    if (current && isUsable(current)) continue;
    const pick = spare.shift();
    if (!pick) continue;
    next[personaId] = pick;
    used.add(pick);
    changed = true;
  }
  return changed ? next : seats;
}

export function NewSessionForm({ personas, connectedProviders, hasCloudProvider, initial }: Props) {
  const t = useTranslations("NewSession");
  const tErr = useTranslations("Errors");
  const locale = useLocale();
  const router = useRouter();
  const hasOpenRouter = connectedProviders.includes("openrouter");
  const catalog = useModelCatalog(connectedProviders);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [depth, setDepth] = useState<Depth>(initial?.depth ?? "standard");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial?.personaIds ?? personas.slice(0, 3).map((p) => p.id),
  );
  const [seatModels, setSeatModels] = useState<Record<string, string>>(initial?.seatModels ?? {});
  // Free by default: anyone can try Parloir without spending anything.
  const [freeOnly, setFreeOnly] = useState(hasOpenRouter);
  const [judgeModel, setJudgeModel] = useState(initial?.judgeModel ?? "");
  const [synthesizerModel, setSynthesizerModel] = useState(initial?.synthesizerModel ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelById = useMemo(() => {
    const map = new Map<string, PickerModel>();
    for (const m of catalog.models) map.set(m.id, m);
    return map;
  }, [catalog.models]);

  const isUsable = useCallback(
    (id: string) => {
      const m = modelById.get(id);
      if (!m) return false;
      return !freeOnly || m.isFree;
    },
    [modelById, freeOnly],
  );

  const pool = freeOnly ? catalog.defaults.free : catalog.defaults.all;

  // Seat a model for every selected panelist once the catalog is in, and
  // whenever the selection or the free-only filter changes.
  useEffect(() => {
    if (catalog.loading || catalog.models.length === 0) return;
    setSeatModels((seats) => fillSeats(selectedIds, seats, pool, isUsable));
  }, [catalog.loading, catalog.models.length, selectedIds, pool, isUsable]);

  // --- Suggest-a-panel state ----------------------------------------------
  const [suggestStatus, setSuggestStatus] = useState<SuggestStatus>("idle");
  const [titleAnimationKey, setTitleAnimationKey] = useState<number | undefined>(undefined);
  const [suggestedRowIds, setSuggestedRowIds] = useState<Set<string>>(() => new Set());
  const snapshotRef = useRef<Snapshot | null>(null);

  // Latest form values for async handlers: the user may edit while the
  // suggestion request is in flight, and undo must restore what they had.
  const latestRef = useRef<Snapshot>({ title, selectedIds, seatModels, depth });
  useEffect(() => {
    latestRef.current = { title, selectedIds, seatModels, depth };
  }, [title, selectedIds, seatModels, depth]);

  const clearSuggestionState = useCallback(() => {
    snapshotRef.current = null;
    setSuggestStatus("idle");
    setSuggestedRowIds(new Set());
  }, []);

  const invalidateIfJustApplied = useCallback(() => {
    if (snapshotRef.current !== null) clearSuggestionState();
  }, [clearSuggestionState]);

  const onUserEditTitle = useCallback(
    (v: string) => {
      invalidateIfJustApplied();
      setTitle(v);
    },
    [invalidateIfJustApplied],
  );
  const onUserEditQuestion = useCallback(
    (v: string) => {
      invalidateIfJustApplied();
      setQuestion(v);
    },
    [invalidateIfJustApplied],
  );
  const onUserDepth = useCallback(
    (d: Depth) => {
      invalidateIfJustApplied();
      setDepth(d);
    },
    [invalidateIfJustApplied],
  );
  const onUserModel = useCallback(
    (personaId: string, modelId: string) => {
      invalidateIfJustApplied();
      // Choosing a paid model is an explicit opt-out of the free-only panel.
      if (freeOnly && modelById.get(modelId)?.isFree === false) setFreeOnly(false);
      setSeatModels((prev) => ({ ...prev, [personaId]: modelId }));
    },
    [invalidateIfJustApplied, freeOnly, modelById],
  );
  const onUserToggle = useCallback(
    (id: string) => {
      invalidateIfJustApplied();
      setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    },
    [invalidateIfJustApplied],
  );

  const handleSuggest = useCallback(async () => {
    if (suggestStatus === "thinking" || question.trim().length < 10) return;
    setSuggestStatus("thinking");
    try {
      const r = await fetch("/api/sessions/recommend-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim(), freeOnly }),
      });
      if (r.status === 204 || !r.ok) {
        setSuggestStatus("idle");
        return;
      }
      const data = (await r.json()) as PanelSuggestionResponse;
      const live = latestRef.current;
      snapshotRef.current = { ...live };

      const glow = new Set<string>();
      for (const id of data.personaIds) if (!live.selectedIds.includes(id)) glow.add(id);
      for (const id of live.selectedIds) if (!data.personaIds.includes(id)) glow.add(id);

      if (live.title.trim() === "") {
        setTitle(data.title);
        setTitleAnimationKey((k) => (k ?? 0) + 1);
      }
      setSelectedIds(data.personaIds);
      setSeatModels((prev) => ({ ...prev, ...data.overrides }));
      setDepth(data.depth);
      setSuggestedRowIds(glow);
      setSuggestStatus("just-applied");
    } catch {
      setSuggestStatus("idle");
    }
  }, [suggestStatus, question, freeOnly]);

  const handleUndo = useCallback(() => {
    const snap = snapshotRef.current;
    if (snap) {
      setTitle(snap.title);
      setSelectedIds(snap.selectedIds);
      setSeatModels(snap.seatModels);
      setDepth(snap.depth);
    }
    clearSuggestionState();
  }, [clearSuggestionState]);
  // ----------------------------------------------------------------------

  const catalogReady = !catalog.loading && catalog.models.length > 0;
  const allSeated = selectedIds.every((id) => Boolean(seatModels[id]));

  const canStart = useMemo(() => {
    if (!title.trim() || title.length > 200) return false;
    if (question.trim().length < 10 || question.length > 4000) return false;
    if (selectedIds.length < 2 || selectedIds.length > 5) return false;
    // Without a catalog the server fills models itself.
    if (catalogReady && !allSeated) return false;
    return true;
  }, [title, question, selectedIds, catalogReady, allSeated]);

  const handleStart = async () => {
    if (!canStart || busy) return;
    setBusy(true);
    setError(null);
    try {
      const participantOverrides: Record<string, string> = {};
      for (const id of selectedIds) if (seatModels[id]) participantOverrides[id] = seatModels[id];

      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          question: question.trim(),
          personaIds: selectedIds,
          protocol: { maxCritiqueRounds: DEPTH_ROUNDS[depth], judgeModel, synthesizerModel },
          participantOverrides,
          freeOnly,
          locale: locale === "fr" ? "fr" : "en",
        }),
      });
      if (!createRes.ok) {
        const err = (await createRes.json().catch(() => ({}))) as { error?: unknown; code?: string };
        if (err.code && tErr.has(err.code)) throw new Error(tErr(err.code));
        throw new Error(typeof err.error === "string" ? err.error : t("createFailed"));
      }
      const { session } = (await createRes.json()) as { session: { id: string } };

      const startRes = await fetch(`/api/sessions/${session.id}/start`, { method: "POST" });
      if (!startRes.ok) {
        const err = (await startRes.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof err.error === "string" ? err.error : t("startFailed"));
      }
      router.push(`/sessions/${session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleStart();
      }}
      className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-10 sm:px-6"
    >
      <header className="space-y-2 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
          {t("eyebrow")}
        </span>
        <h1 className="font-display text-3xl text-[var(--color-text-primary)]">{t("heading")}</h1>
      </header>

      {initial && (
        <p className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3 text-sm text-[var(--color-text-muted)]">
          {t("retryBanner")}
        </p>
      )}

      <QuestionInput
        title={title}
        question={question}
        onTitle={onUserEditTitle}
        onQuestion={onUserEditQuestion}
        titleAnimationKey={titleAnimationKey}
        suggestSlot={
          hasOpenRouter ? (
            <SuggestPanelButton
              status={suggestStatus}
              disabled={question.trim().length < 10}
              onSuggest={handleSuggest}
              onUndo={handleUndo}
              onAutoClear={clearSuggestionState}
            />
          ) : null
        }
      />

      <DepthSelector value={depth} onChange={onUserDepth} />

      <div className="space-y-3">
        {hasOpenRouter && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-2.5">
            <input
              type="checkbox"
              checked={freeOnly}
              onChange={(e) => {
                invalidateIfJustApplied();
                setFreeOnly(e.target.checked);
              }}
              className="mt-1 accent-[var(--color-spot-warm)]"
            />
            <span>
              <span className="block text-sm text-[var(--color-text-primary)]">{t("freeOnly")}</span>
              <span className="block text-xs text-[var(--color-text-muted)]">{t("freeOnlyHint")}</span>
            </span>
          </label>
        )}

        {catalog.error && (
          <p role="alert" className="text-xs text-[var(--color-danger)]">
            {t("catalogError")}
          </p>
        )}

        <PersonaChecklist
          personas={personas}
          selected={selectedIds}
          seatModels={seatModels}
          models={catalog.models}
          modelsLoading={catalog.loading}
          freeOnly={freeOnly}
          onToggle={onUserToggle}
          onModel={onUserModel}
          highlightedIds={suggestedRowIds}
        />
      </div>

      {catalogReady && (
        <details className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-3 py-2.5">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
            {t("advanced")}
          </summary>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{t("advancedHint")}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                {t("judge")}
              </span>
              <ModelPicker
                label={t("judge")}
                value={judgeModel}
                models={catalog.models}
                allowAuto
                freeOnlyDefault={freeOnly}
                onChange={setJudgeModel}
              />
            </div>
            <div className="space-y-1">
              <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                {t("secretary")}
              </span>
              <ModelPicker
                label={t("secretary")}
                value={synthesizerModel}
                models={catalog.models}
                allowAuto
                freeOnlyDefault={freeOnly}
                onChange={setSynthesizerModel}
              />
            </div>
          </div>
        </details>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {!hasCloudProvider && <LocalOnlyReliabilityNote />}

      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
        {!canStart && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("needs")}
          </span>
        )}
        <StartButton disabled={!canStart} busy={busy} onClick={handleStart} />
      </div>
    </form>
  );
}
