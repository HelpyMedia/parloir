"use client";

import { AnimatePresence } from "framer-motion";
import { useState } from "react";
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
  const [paused, setPaused] = useState(false);

  const activeSpeakerId = state.live?.speakerId ?? null;
  const isSynthesisDone = state.phase === "completed" && state.synthesis !== null;
  const showPausedOverlay = paused || state.humanInjectionPrompt !== null;

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
                paused={showPausedOverlay}
              />
              <AnimatePresence>
                {showPausedOverlay && (
                  <PausedOverlay
                    prompt={state.humanInjectionPrompt}
                    onSubmit={() => {
                      setPaused(false);
                    }}
                    onCancel={() => setPaused(false)}
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
        phase={isSynthesisDone ? "completed" : paused ? "paused" : state.phase}
        canExport={isSynthesisDone}
        onPauseToggle={() => setPaused((p) => !p)}
        onInterject={() => setPaused(true)}
        onAskRound={() => setPaused(true)}
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
          a.download = `parloir-session-${state.sessionId.slice(0, 8)}.md`;
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
    </div>
  );
}
