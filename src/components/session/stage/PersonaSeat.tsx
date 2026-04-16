"use client";

import { accentVar } from "@/lib/session-ui/persona-accent";
import type { Persona } from "@/lib/orchestrator/types";
import type { UIPersonaState } from "@/lib/session-ui/types";
import type { SeatPosition } from "./seatPositions";

interface Props {
  persona: Persona;
  state: UIPersonaState;
  seat: SeatPosition;
  active: boolean;
}

export function PersonaSeat({ persona, state, seat, active }: Props) {
  const initial = persona.name.slice(0, 1).toUpperCase();
  const color = accentVar(persona.id);
  const opacity = state.silenced ? 0.3 : 1;

  return (
    <g transform={`translate(${seat.x},${seat.y})`} opacity={opacity}>
      <circle
        r={22}
        fill="var(--color-surface-raised)"
        stroke={color}
        strokeWidth={active ? 2 : 1}
      />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontFamily="var(--font-inter)"
        fontSize="14"
        fontWeight="600"
      >
        {initial}
      </text>
      <text
        y={42}
        textAnchor="middle"
        fill="var(--color-text-muted)"
        fontFamily="var(--font-inter)"
        fontSize="10"
      >
        {persona.name.split(" ")[0]}
      </text>
    </g>
  );
}
