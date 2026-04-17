"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { Persona } from "@/lib/orchestrator/types";
import { DepthSelector, DEPTH_ROUNDS, type Depth } from "./DepthSelector";
import { LocalOnlyReliabilityNote } from "./LocalOnlyReliabilityNote";
import { ModeSelector, type Mode } from "./ModeSelector";
import { PanelPresetPicker } from "./PanelPresetPicker";
import { PersonaChecklist } from "./PersonaChecklist";
import { QuestionInput } from "./QuestionInput";
import { StartButton } from "./StartButton";

interface Props {
  personas: Persona[];
  connectedProviders: string[];
  hasCloudProvider: boolean;
}

export function NewSessionForm({ personas, connectedProviders, hasCloudProvider }: Props) {
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

  const setOverride = (personaId: string, modelId: string) =>
    setOverrides((prev) => ({ ...prev, [personaId]: modelId }));

  const canStart = useMemo(() => {
    if (!title.trim() || title.length > 200) return false;
    if (question.trim().length < 10 || question.length > 4000) return false;
    if (selectedIds.length < 2 || selectedIds.length > 5) return false;
    return true;
  }, [title, question, selectedIds]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

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
            Object.keys(participantOverrides).length > 0 ? participantOverrides : undefined,
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
        onTitle={setTitle}
        onQuestion={setQuestion}
      />

      <ModeSelector value={mode} onChange={setMode} />
      <PanelPresetPicker />
      <DepthSelector value={depth} onChange={setDepth} />
      <PersonaChecklist
        personas={personas}
        selected={selectedIds}
        overrides={overrides}
        connectedProviders={connectedProviders}
        onToggle={toggle}
        onOverride={setOverride}
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
