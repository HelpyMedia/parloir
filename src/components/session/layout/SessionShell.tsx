"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useState } from "react";
import { useScrollCollapse } from "@/hooks/useScrollCollapse";
import { useSessionStream } from "@/hooks/useSessionStream";
import { deriveInsights } from "@/lib/session-ui/derive";
import type { HydrationBundle } from "@/lib/session-ui/types";
import { CollapsedStageBar } from "../stage/CollapsedStageBar";
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
  const [hoverExpand, setHoverExpand] = useState(false);
  const scrollCollapsed = useScrollCollapse(140);
  const collapsed = scrollCollapsed && !hoverExpand;

  const sessionId = state.sessionId;
  const isPaused =
    state.phase === "paused" || state.humanInjectionPrompt !== null;
  const activeSpeakerId = state.live?.speakerId ?? null;
  const isSynthesisDone =
    state.phase === "completed" && state.synthesis !== null;

  const requestPause = useCallback(async () => {
    if (pausePending) return;
    setPausePending(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/pause`, {
        method: "POST",
      });
      if (!res.ok) {
        console.error("pause failed", await res.text());
      }
    } finally {
      setPausePending(false);
    }
  }, [pausePending, sessionId]);

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
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg-chamber)] text-[var(--color-text-primary)]">
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
        <main className="flex-1 overflow-y-auto">
          <SynthesisPanel artifact={state.synthesis} />
        </main>
      ) : (
        <>
          <div
            className="sticky top-0 z-30 bg-[var(--color-bg-chamber)]"
            onMouseEnter={() => scrollCollapsed && setHoverExpand(true)}
            onMouseLeave={() => setHoverExpand(false)}
          >
            {collapsed ? (
              <CollapsedStageBar
                personas={state.personas}
                personaState={state.personaState}
                activeSpeakerId={activeSpeakerId}
                live={state.live}
              />
            ) : (
              <div className="relative flex min-h-[380px]">
                <PersonaRail
                  personas={state.personas}
                  personaState={state.personaState}
                />
                <div className="relative flex flex-1 items-stretch">
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
            )}
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
        onPauseToggle={isPaused ? requestResume : requestPause}
        onInterject={requestPause}
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
          a.download = `parloir-session-${sessionId.slice(0, 8)}.md`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
