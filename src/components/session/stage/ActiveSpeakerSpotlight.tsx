"use client";

import { motion, useReducedMotion } from "framer-motion";
import { accentVar } from "@/lib/session-ui/persona-accent";
import type { SeatPosition } from "./seatPositions";

interface Props {
  personaId: string;
  seat: SeatPosition;
}

export function ActiveSpeakerSpotlight({ personaId, seat }: Props) {
  const reduced = useReducedMotion();
  const color = accentVar(personaId);

  return (
    <g transform={`translate(${seat.x},${seat.y})`}>
      <motion.circle
        r={32}
        fill="none"
        stroke={color}
        strokeWidth={1}
        initial={{ opacity: 0.3, scale: 1 }}
        animate={reduced ? { opacity: 0.5 } : { opacity: [0.2, 0.55, 0.2], scale: [1, 1.2, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.circle
        r={48}
        fill={color}
        initial={{ opacity: 0 }}
        animate={reduced ? { opacity: 0.08 } : { opacity: [0.06, 0.14, 0.06] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        style={{ filter: "blur(10px)" }}
      />
    </g>
  );
}
