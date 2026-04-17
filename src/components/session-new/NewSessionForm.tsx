"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Persona } from "@/lib/orchestrator/types";
import { DepthSelector, DEPTH_ROUNDS, type Depth } from "./DepthSelector";
import { LocalOnlyReliabilityNote } from "./LocalOnlyReliabilityNote";
import { ModeSelector, type Mode } from "./ModeSelector";
import { PersonaChecklist } from "./PersonaChecklist";
import { QuestionInput } from "./QuestionInput";
import { StartButton } from "./StartButton";
import {
  SuggestPanelButton,
  type SuggestStatus,
} from "./SuggestPanelButton";

interface Props {
  personas: Persona[];
  connectedProviders: string[];
  hasCloudProvider: boolean;
}

interface Snapshot {
  title: string;
  selectedIds: string[];
  overrides: Record<string, string>;
  depth: Depth;
}

interface PanelSuggestionResponse {
  title: string;
  personaIds: string[];
  overrides: Record<string, string>;
  depth: Depth;
}

export function NewSessionForm({
  personas,
  connectedProviders,
  hasCloudProvider,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<Mode>("decide");
  const [depth, setDepth] = useState<Depth>("standard");
  const [selectedIds, setSelectedIds] = useState<string[]>(
    personas.slice(0, 3).map((p) => p.id),
  );
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Suggest-a-panel state ----------------------------------------------
  const [suggestStatus, setSuggestStatus] = useState<SuggestStatus>("idle");
  const [titleAnimationKey, setTitleAnimationKey] = useState<number | undefined>(
    undefined,
  );
  const [suggestedRowIds, setSuggestedRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const snapshotRef = useRef<Snapshot | null>(null);

  // Mirror of the form fields the recommender can touch. Updated on every
  // render so async handlers can read the *latest* state at response time,
  // not state captured in the useCallback closure when the request started.
  // Without this, the user could edit during the in-flight fetch and have
  // their edits overwritten, and undo would restore a stale pre-apply state.
  const latestRef = useRef<Snapshot>({
    title,
    selectedIds,
    overrides,
    depth,
  });
  useEffect(() => {
    latestRef.current = { title, selectedIds, overrides, depth };
  }, [title, selectedIds, overrides, depth]);

  const clearSuggestionState = useCallback(() => {
    snapshotRef.current = null;
    setSuggestStatus("idle");
    setSuggestedRowIds(new Set());
  }, []);

  // Any manual edit to a suggested field invalidates the snapshot.
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
      // The question is not part of the suggestion, but editing it after
      // apply still means the user has moved on — clear the undo chip.
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
  const onUserOverride = useCallback(
    (personaId: string, modelId: string) => {
      invalidateIfJustApplied();
      setOverrides((prev) => ({ ...prev, [personaId]: modelId }));
    },
    [invalidateIfJustApplied],
  );
  const onUserToggle = useCallback(
    (id: string) => {
      invalidateIfJustApplied();
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [invalidateIfJustApplied],
  );

  const handleSuggest = useCallback(async () => {
    if (suggestStatus === "thinking") return;
    if (question.trim().length < 10) return;

    setSuggestStatus("thinking");
    try {
      const r = await fetch("/api/sessions/recommend-panel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });
      if (r.status === 204 || !r.ok) {
        // Silent failure — brief says the form must stay usable.
        setSuggestStatus("idle");
        return;
      }
      const data = (await r.json()) as PanelSuggestionResponse;

      // Read the LIVE state at response time, not the closure's capture.
      // The user may have edited fields while the request was in flight;
      // snapshotting stale closure values would corrupt undo, and checking
      // a stale title against "" could overwrite a title the user just typed.
      const live = latestRef.current;

      snapshotRef.current = { ...live };

      const glow = new Set<string>();
      for (const id of data.personaIds)
        if (!live.selectedIds.includes(id)) glow.add(id);
      for (const id of live.selectedIds)
        if (!data.personaIds.includes(id)) glow.add(id);

      if (live.title.trim() === "") {
        setTitle(data.title);
        setTitleAnimationKey((k) => (k ?? 0) + 1);
      }
      setSelectedIds(data.personaIds);
      setOverrides(data.overrides);
      setDepth(data.depth);
      setSuggestedRowIds(glow);
      setSuggestStatus("just-applied");
    } catch {
      // Network error — silent no-op.
      setSuggestStatus("idle");
    }
  }, [suggestStatus, question]);

  const handleUndo = useCallback(() => {
    const snap = snapshotRef.current;
    if (!snap) {
      clearSuggestionState();
      return;
    }
    setTitle(snap.title);
    setSelectedIds(snap.selectedIds);
    setOverrides(snap.overrides);
    setDepth(snap.depth);
    clearSuggestionState();
  }, [clearSuggestionState]);
  // ----------------------------------------------------------------------

  const canStart = useMemo(() => {
    if (!title.trim() || title.length > 200) return false;
    if (question.trim().length < 10 || question.length > 4000) return false;
    if (selectedIds.length < 2 || selectedIds.length > 5) return false;
    return true;
  }, [title, question, selectedIds]);

  const canSuggest = question.trim().length >= 10;

  const handleStart = async () => {
    if (!canStart) return;
    setBusy(true);
    setError(null);
    try {
      const participantOverrides: Record<string, string> = {};
      for (const id of selectedIds) {
        const persona = personas.find((p) => p.id === id);
        const ov = overrides[id];
        if (persona && ov && ov !== persona.model) participantOverrides[id] = ov;
      }

      const createRes = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          question: question.trim(),
          personaIds: selectedIds,
          protocol: { maxCritiqueRounds: DEPTH_ROUNDS[depth] },
          participantOverrides:
            Object.keys(participantOverrides).length > 0
              ? participantOverrides
              : undefined,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err?.error?.toString?.() ?? "Failed to create session");
      }
      const { session } = (await createRes.json()) as { session: { id: string } };

      const startRes = await fetch(`/api/sessions/${session.id}/start`, {
        method: "POST",
      });
      if (!startRes.ok) {
        const err = await startRes.json().catch(() => ({}));
        throw new Error(err?.error ?? "Failed to start session");
      }

      router.push(`/sessions/${session.id}`);
    } catch (e) {
      setError(String((e as Error).message ?? e));
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void handleStart();
      }}
      className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-6 py-10"
    >
      <header className="space-y-2 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
          New session
        </span>
        <h1 className="font-display text-3xl text-[var(--color-text-primary)]">
          What should the council help you with?
        </h1>
      </header>

      <QuestionInput
        title={title}
        question={question}
        onTitle={onUserEditTitle}
        onQuestion={onUserEditQuestion}
        titleAnimationKey={titleAnimationKey}
        suggestSlot={
          <SuggestPanelButton
            status={suggestStatus}
            disabled={!canSuggest}
            onSuggest={handleSuggest}
            onUndo={handleUndo}
            onAutoClear={clearSuggestionState}
          />
        }
      />

      <ModeSelector value={mode} onChange={setMode} />
      <DepthSelector value={depth} onChange={onUserDepth} />
      <PersonaChecklist
        personas={personas}
        selected={selectedIds}
        overrides={overrides}
        connectedProviders={connectedProviders}
        onToggle={onUserToggle}
        onOverride={onUserOverride}
        highlightedIds={suggestedRowIds}
      />

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]"
        >
          {error}
        </div>
      )}

      {!hasCloudProvider && <LocalOnlyReliabilityNote />}

      <div className="flex items-center justify-end gap-4">
        {!canStart && (
          <span className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
            Need a title, a question (≥10 chars), and 2–5 personas
          </span>
        )}
        <StartButton disabled={!canStart} busy={busy} onClick={handleStart} />
      </div>
    </form>
  );
}
