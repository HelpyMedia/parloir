"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { Persona } from "@/lib/orchestrator/types";
import type { LiveTurn, UIPersonaState } from "@/lib/session-ui/types";
import { StageTicker } from "./StageTicker";
import { TableScene } from "./TableScene";

interface Props {
  personas: Persona[];
  personaState: Record<string, UIPersonaState>;
  activeSpeakerId: string | null;
  paused: boolean;
  live: LiveTurn | null;
}

export function CouncilStage({
  personas,
  personaState,
  activeSpeakerId,
  paused,
  live,
}: Props) {
  return (
    <section className="relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,var(--color-bg-table)_0%,var(--color-bg-chamber)_75%)] p-4">
      <motion.div
        className="h-full w-full max-w-[720px]"
        animate={{
          filter: paused ? "blur(2px) brightness(0.65)" : "blur(0) brightness(1)",
        }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <TableScene
          personas={personas}
          personaState={personaState}
          activeSpeakerId={activeSpeakerId}
        />
      </motion.div>
      <AnimatePresence mode="wait">
        {live && activeSpeakerId && !paused && (
          <StageTicker
            speakerId={activeSpeakerId}
            speakerName={live.speakerName}
            text={live.text}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
