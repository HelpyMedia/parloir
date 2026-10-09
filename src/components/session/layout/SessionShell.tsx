"use client";

import { AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useSessionStream } from "@/hooks/useSessionStream";
import { deriveInsights } from "@/lib/session-ui/derive";
import type { HydrationBundle } from "@/lib/session-ui/types";
import { CouncilStage } from "../stage/CouncilStage";
import { PausedOverlay } from "../paused/PausedOverlay";
import { PersonaRail } from "../rails/PersonaRail";
import { InsightRail } from "../rails/InsightRail";
import { SynthesisPanel } from "../synthesis/SynthesisPanel";
import { TranscriptDrawer } from "../transcript/TranscriptDrawer";
import { PhaseBar } from "./PhaseBar";
import { StickyActionBar } from "./StickyActionBar";
import { TopBar } from "./TopBar";
import { FailedModelsDialog } from "./FailedModelsDialog";
import { ModelFixPanel } from "../paused/ModelFixPanel";
import { ResearchUnavailableNotice } from "../transcript/ResearchNotice";
import type { RailEditing } from "../rails/PersonaRail";
import { useModelCatalog } from "@/components/models/useModelCatalog";

export function SessionShell({ bundle, providers = [] }: { bundle: HydrationBundle; providers?: string[] }) {
  const state = useSessionStream(bundle);
  const insights = deriveInsights(state);
  const t = useTranslations("Session");
  const tErr = useTranslations("Errors");
  const router = useRouter();
  const errorText =
    state.errorCode && tErr.has(state.errorCode) ? tErr(state.errorCode) : state.error;
  const [pausePending, setPausePending] = useState(false);
  // Open by default once a debate fails because of its models; closable.
  const [failedDialogDismissed, setFailedDialogDismissed] = useState(false);
  const showFailedDialog =
    state.phase === "failed" && state.failedSeats.length > 0 && !failedDialogDismissed;
  const retry = useCallback(() => router.push(`/sessions/new?from=${state.sessionId}`), [router, state.sessionId]);
  const closeFailedDialog = useCallback(() => setFailedDialogDismissed(true), []);
  const [resumePending, setResumePending] = useState(false);

  const sessionId = state.sessionId;
  const isPaused =
    state.phase === "paused" || state.humanInjectionPrompt !== null;
  const activeSpeakerId = state.live?.speakerId ?? null;
  const isSynthesisDone =
    state.phase === "completed" && state.synthesis !== null;

  const requestPause = useCallback(async () => {
    if (pausePending || isPaused) return;
    setPausePending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/pause`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("pause failed", await res.text());
        setPausePending(false);
      }
      // Otherwise leave pending=true until the effect below sees isPaused flip,
      // so the spinner stays up through the "waiting for phase boundary" gap.
    } catch (e) {
      console.error("pause failed", e);
      setPausePending(false);
    }
  }, [pausePending, isPaused, sessionId]);

  useEffect(() => {
    if (isPaused) setPausePending(false);
  }, [isPaused]);

  const requestResume = useCallback(async () => {
    if (resumePending) return;
    setResumePending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/resume`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("resume failed", await res.text());
      }
    } finally {
      setResumePending(false);
    }
  }, [resumePending, sessionId]);

  // --- Fixing the panel while paused ----------------------------------------
  // Model switches and removals are saved right away; the orchestrator reads
  // them when the debate resumes. Kept locally too, since the stream doesn't
  // echo them back.
  const catalog = useModelCatalog(isPaused ? providers : []);
  const [seatEdits, setSeatEdits] = useState<Record<string, string>>({});
  const [removedLocal, setRemovedLocal] = useState<string[]>([]);
  const [busySeat, setBusySeat] = useState<string | null>(null);
  const [seatError, setSeatError] = useState<string | null>(null);
  const tCouncil = useTranslations("Council");
  const seatModels = { ...(state.session.participantModelOverrides ?? {}), ...seatEdits };
  const removedIds = [...new Set([...state.removedIds, ...removedLocal])];
  const activeCount = state.participantOrder.filter((id) => !removedIds.includes(id)).length;

  const seatRequest = useCallback(
    async (personaId: string, init: RequestInit) => {
      setBusySeat(personaId);
      setSeatError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/seats/${encodeURIComponent(personaId)}`, init);
        if (res.ok) return true;
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        setSeatError(
          body.code === "min_panel"
            ? tCouncil("seatMinPanel")
            : body.code === "not_paused"
              ? tCouncil("seatNotPaused")
              : tCouncil("seatSaveFailed"),
        );
        return false;
      } catch {
        setSeatError(tCouncil("seatSaveFailed"));
        return false;
      } finally {
        setBusySeat(null);
      }
    },
    [sessionId, tCouncil],
  );

  const editing: RailEditing | null = isPaused
    ? {
        models: catalog.models,
        loading: catalog.loading,
        failed: Object.fromEntries((state.modelFix ?? []).map((s) => [s.personaId, s.code])),
        canRemove: activeCount > 2,
        busyId: busySeat,
        onModel: async (personaId, modelId) => {
          const ok = await seatRequest(personaId, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ modelId }),
          });
          if (ok) setSeatEdits((prev) => ({ ...prev, [personaId]: modelId }));
        },
        onRemove: async (personaId) => {
          const ok = await seatRequest(personaId, { method: "DELETE" });
          if (ok) setRemovedLocal((prev) => [...prev, personaId]);
        },
      }
    : null;

  const submitInjection = useCallback(
    async (content: string) => {
      const res = await fetch(`/api/sessions/${sessionId}/inject`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        console.error("inject failed", await res.text());
        return;
      }
      await requestResume();
    },
    [sessionId, requestResume],
  );

  return (
    <div className="min-h-dvh bg-[var(--color-bg-chamber)] text-[var(--color-text-primary)]">
      <TopBar
        session={state.session}
        phase={state.phase}
        round={state.round}
        totalCostUsd={state.totalCostUsd}
      />
      <PhaseBar phase={state.phase} />
      {errorText && (
        <div
          role="alert"
          className="border-b border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-6 py-2 text-sm text-[var(--color-danger)]"
        >
          {state.phase === "failed" && <strong className="mr-2">{t("failedTitle")}</strong>}
          {errorText}
        </div>
      )}
      {state.research?.status === "skipped" && state.research.reason !== "not_needed" && (
        <ResearchUnavailableNotice reason={state.research.reason} />
      )}
      {state.notices.length > 0 && state.phase !== "completed" && (
        <ul
          aria-live="polite"
          className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-6 py-2 text-xs text-[var(--color-text-muted)]"
        >
          {state.notices.map((n) =>
            n.switched ? (
              <li key={n.seqKey}>
                {t("modelSwitched", {
                  name: n.speakerName,
                  from: n.switched.from.replace(/^openrouter\//, ""),
                  to: n.switched.to.replace(/^openrouter\//, ""),
                })}
              </li>
            ) : (
              <li key={n.seqKey}>
                {t("turnSkipped", { name: n.speakerName })}{" "}
                {/* Errors.unknown describes a stopped debate; one skipped turn is not that. */}
                {n.code === "unknown" ? tErr("turnFailed") : tErr.has(n.code) ? tErr(n.code) : n.message}
              </li>
            ),
          )}
        </ul>
      )}

      {isSynthesisDone && state.synthesis ? (
        <main>
          <SynthesisPanel artifact={state.synthesis} />
        </main>
      ) : (
        <>
          <div className="relative flex flex-col border-b border-[var(--color-border-subtle)] lg:flex-row lg:items-start">
            <PersonaRail
              personas={state.personas}
              personaState={state.personaState}
              models={seatModels}
              removedIds={removedIds}
              editing={editing}
            />
            <div className="relative flex w-full flex-1 items-stretch self-start lg:w-auto">
              <CouncilStage
                personas={state.personas}
                personaState={state.personaState}
                activeSpeakerId={activeSpeakerId}
                paused={isPaused}
                live={state.live}
              />
              <AnimatePresence>
                {isPaused && (
                  <PausedOverlay
                    prompt={state.humanInjectionPrompt}
                    onSubmit={submitInjection}
                    onCancel={requestResume}
                    replacement={
                      state.modelFix && editing ? (
                        <ModelFixPanel
                          seats={state.modelFix}
                          personas={state.personas}
                          models={seatModels}
                          removedIds={removedIds}
                          editing={editing}
                          resumePending={resumePending}
                          error={seatError}
                          onResume={requestResume}
                        />
                      ) : undefined
                    }
                  />
                )}
              </AnimatePresence>
            </div>
            <InsightRail insights={insights} />
          </div>
          <TranscriptDrawer
            turns={state.turns}
            live={state.live}
            consensusReports={state.consensusReports}
            personas={state.personas}
            paused={isPaused}
            sources={state.sources}
            research={state.research}
            researching={state.phase === "research"}
          />
        </>
      )}

      {showFailedDialog && (
        <FailedModelsDialog
          seats={state.failedSeats}
          summary={errorText}
          onRetry={retry}
          onClose={closeFailedDialog}
        />
      )}

      <StickyActionBar
        phase={
          isSynthesisDone ? "completed" : isPaused ? "paused" : state.phase
        }
        canExport={isSynthesisDone}
        pausePending={pausePending}
        onPauseToggle={isPaused ? requestResume : requestPause}
        onRetry={retry}
        onExport={() => {
          if (!state.synthesis) return;
          const content =
            state.synthesis.transcriptMarkdown || state.synthesis.decision;
          const blob = new Blob([content], {
            type: "text/markdown;charset=utf-8",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = buildExportFilename(state.session?.title, sessionId);
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}

function buildExportFilename(title: string | undefined, sessionId: string): string {
  const shortId = sessionId.slice(0, 8);
  const slug = (title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug ? `parloir-${slug}-${shortId}.md` : `parloir-session-${shortId}.md`;
}
