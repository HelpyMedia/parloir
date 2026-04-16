"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Check, Search } from "lucide-react";
import type { PersonaStatus, UIPersonaState } from "@/lib/session-ui/types";
import type { SeatPosition } from "./seatPositions";

interface Props {
  personaState: Record<string, UIPersonaState>;
  seatFor: (personaId: string) => SeatPosition | undefined;
}

const STATUS_ICON: Partial<Record<PersonaStatus, typeof Search>> = {
  researching: Search,
  challenging: AlertCircle,
  revising: Check,
};

const STATUS_COLOR: Partial<Record<PersonaStatus, string>> = {
  researching: "var(--color-evidence)",
  challenging: "var(--color-dissent)",
  revising: "var(--color-consensus)",
};

export function StageStatusLayer({ personaState, seatFor }: Props) {
  const entries = Object.values(personaState).filter(
    (s) => STATUS_ICON[s.status] !== undefined,
  );

  return (
    <div className="pointer-events-none absolute inset-0">
      <AnimatePresence>
        {entries.map((s) => {
          const seat = seatFor(s.personaId);
          if (!seat) return null;
          const Icon = STATUS_ICON[s.status]!;
          const color = STATUS_COLOR[s.status];
          const leftPct = (seat.x / 600) * 100;
          const topPct = ((seat.y - 32) / 400) * 100;
          return (
            <motion.div
              key={`${s.personaId}-${s.status}`}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border bg-[var(--color-bg-chamber)] p-1.5"
              style={{ left: `${leftPct}%`, top: `${topPct}%`, borderColor: color, color }}
              initial={{ opacity: 0, y: 8, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 260, damping: 20 }}
            >
              <Icon className="h-3.5 w-3.5" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
