"use client";

import { AnimatePresence } from "framer-motion";
import { accentVar } from "@/lib/session-ui/persona-accent";
import type { Persona } from "@/lib/orchestrator/types";
import type { LiveTurn, UIPersonaState } from "@/lib/session-ui/types";
import { StageTicker } from "./StageTicker";

interface Props {
  personas: Persona[];
  personaState: Record<string, UIPersonaState>;
  activeSpeakerId: string | null;
  live: LiveTurn | null;
}

/**
 * Compact sticky version of the council stage. Shows persona dots in seat
 * order, highlights the active speaker, and inlines the live ticker so
 * scrolling readers don't lose the "who's talking" signal.
 */
export function CollapsedStageBar({
  personas,
  personaState,
  activeSpeakerId,
  live,
}: Props) {
  return (
    <div className="flex h-14 items-center gap-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-6">
      <div className="flex flex-none items-center gap-1.5">
        {personas.map((p) => {
          const state = personaState[p.id];
          const color = accentVar(p.id);
          const active = activeSpeakerId === p.id;
          const silenced = state?.silenced ?? false;
          const initial = p.name.slice(0, 1).toUpperCase();
          return (
            <div
              key={p.id}
              title={p.name}
              className="flex h-7 w-7 items-center justify-center rounded-full border font-mono text-[10px] font-semibold transition-all"
              style={{
                borderColor: color,
                borderWidth: active ? 2 : 1,
                color,
                opacity: silenced ? 0.3 : active ? 1 : 0.75,
                boxShadow: active ? `0 0 10px ${color}55` : "none",
                backgroundColor: "var(--color-surface-raised)",
              }}
            >
              {initial}
            </div>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {live && activeSpeakerId && (
          <StageTicker
            variant="bar"
            speakerId={activeSpeakerId}
            speakerName={live.speakerName}
            text={live.text}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
