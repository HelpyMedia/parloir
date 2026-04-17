"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
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

export function SessionShell({ bundle }: { bundle: HydrationBundle }) {
  const state = useSessionStream(bundle);
  const insights = deriveInsights(state);
  const [pausePending, setPausePending] = useState(false);
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
      {state.error && (
        <div
          role="alert"
          className="border-b border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 px-6 py-2 text-sm text-[var(--color-danger)]"
        >
          {state.error}
        </div>
      )}

      {isSynthesisDone && state.synthesis ? (
        <main>
          <SynthesisPanel artifact={state.synthesis} />
        </main>
      ) : (
        <>
          <div className="relative flex items-start border-b border-[var(--color-border-subtle)]">
            <PersonaRail
              personas={state.personas}
              personaState={state.personaState}
            />
            <div className="relative flex flex-1 items-stretch self-start">
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
          />
        </>
      )}

      <StickyActionBar
        phase={
          isSynthesisDone ? "completed" : isPaused ? "paused" : state.phase
        }
        canExport={isSynthesisDone}
        pausePending={pausePending}
        onPauseToggle={isPaused ? requestResume : requestPause}
        onAskRound={requestPause /* TODO: replace when ask-round plan ships */}
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
