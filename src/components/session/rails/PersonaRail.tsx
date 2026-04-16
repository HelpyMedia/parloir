"use client";

import type { Persona } from "@/lib/orchestrator/types";
import type { UIPersonaState } from "@/lib/session-ui/types";
import { PersonaCard } from "./PersonaCard";

interface Props {
  personas: Persona[];
  personaState: Record<string, UIPersonaState>;
  onSelect?: (personaId: string) => void;
}

export function PersonaRail({ personas, personaState, onSelect }: Props) {
  return (
    <aside
      aria-label="Council participants"
      className="flex w-60 shrink-0 flex-col gap-3 border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 py-4"
    >
      <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
        Council
      </div>
      <div className="flex flex-col gap-3">
        {personas.map((p) => {
          const state = personaState[p.id] ?? {
            personaId: p.id,
            status: "waiting" as const,
            stance: null,
            confidence: null,
            silenced: false,
          };
          return <PersonaCard key={p.id} persona={p} state={state} onSelect={onSelect} />;
        })}
      </div>
    </aside>
  );
}
