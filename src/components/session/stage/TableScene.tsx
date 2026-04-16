"use client";

import { useMemo } from "react";
import type { Persona } from "@/lib/orchestrator/types";
import type { UIPersonaState } from "@/lib/session-ui/types";
import { ActiveSpeakerSpotlight } from "./ActiveSpeakerSpotlight";
import { PersonaSeat } from "./PersonaSeat";
import {
  STAGE_VIEWBOX,
  TABLE_CENTER,
  TABLE_RX,
  TABLE_RY,
  seatPositions,
  type SeatPosition,
} from "./seatPositions";
import { StageStatusLayer } from "./StageStatusLayer";

interface Props {
  personas: Persona[];
  personaState: Record<string, UIPersonaState>;
  activeSpeakerId: string | null;
}

export function TableScene({ personas, personaState, activeSpeakerId }: Props) {
  const seats = useMemo(() => seatPositions(personas.length), [personas.length]);
  const seatByPersona = useMemo(() => {
    const map = new Map<string, SeatPosition>();
    personas.forEach((p, i) => {
      if (seats[i]) map.set(p.id, seats[i]);
    });
    return map;
  }, [personas, seats]);

  const activeSeat = activeSpeakerId ? seatByPersona.get(activeSpeakerId) : undefined;

  return (
    <div className="relative h-full w-full">
      <svg
        viewBox={`0 0 ${STAGE_VIEWBOX.width} ${STAGE_VIEWBOX.height}`}
        className="h-full w-full"
        role="img"
        aria-label="Council round table"
      >
        <defs>
          <radialGradient id="table-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--color-spot-halo)" />
            <stop offset="80%" stopColor="var(--color-bg-table)" />
          </radialGradient>
        </defs>

        <ellipse
          cx={TABLE_CENTER.x}
          cy={TABLE_CENTER.y}
          rx={TABLE_RX}
          ry={TABLE_RY}
          fill="url(#table-glow)"
          stroke="var(--color-border-strong)"
          strokeWidth={1}
        />
        <ellipse
          cx={TABLE_CENTER.x}
          cy={TABLE_CENTER.y}
          rx={TABLE_RX - 14}
          ry={TABLE_RY - 8}
          fill="none"
          stroke="var(--color-border-subtle)"
          strokeWidth={1}
          strokeDasharray="2 6"
        />

        {activeSpeakerId && activeSeat && (
          <ActiveSpeakerSpotlight personaId={activeSpeakerId} seat={activeSeat} />
        )}

        {personas.map((p, i) => {
          const seat = seats[i];
          if (!seat) return null;
          const state = personaState[p.id] ?? {
            personaId: p.id,
            status: "waiting" as const,
            stance: null,
            confidence: null,
            silenced: false,
          };
          return (
            <PersonaSeat
              key={p.id}
              persona={p}
              state={state}
              seat={seat}
              active={activeSpeakerId === p.id}
            />
          );
        })}
      </svg>

      <StageStatusLayer
        personaState={personaState}
        seatFor={(id) => seatByPersona.get(id)}
      />

      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
      >
        {activeSpeakerId
          ? `Now speaking: ${personas.find((p) => p.id === activeSpeakerId)?.name ?? activeSpeakerId}`
          : "Council is listening"}
      </div>
    </div>
  );
}
