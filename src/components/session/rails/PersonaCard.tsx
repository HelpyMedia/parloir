"use client";

import { PersonaAvatar } from "../shared/PersonaAvatar";
import { StanceChip } from "../shared/StanceChip";
import { ConfidencePips } from "../shared/ConfidencePips";
import { accentVar } from "@/lib/session-ui/persona-accent";
import type { Persona } from "@/lib/orchestrator/types";
import type { PersonaStatus, UIPersonaState } from "@/lib/session-ui/types";

interface Props {
  persona: Persona;
  state: UIPersonaState;
  onSelect?: (personaId: string) => void;
}

const STATUS_LABEL: Record<PersonaStatus, string> = {
  listening: "Listening",
  speaking: "Speaking",
  researching: "Researching",
  revising: "Revising",
  challenging: "Challenging",
  waiting: "Waiting",
  synthesizing: "Synthesizing",
  silenced: "Silenced",
};

export function PersonaCard({ persona, state, onSelect }: Props) {
  const speaking = state.status === "speaking" || state.status === "researching";
  return (
    <button
      type="button"
      onClick={() => onSelect?.(persona.id)}
      className="group flex w-full cursor-pointer items-start gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-3 text-left transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
      style={{ opacity: state.silenced ? 0.4 : 1 }}
    >
      <PersonaAvatar
        personaId={persona.id}
        name={persona.name}
        size="md"
        active={speaking}
        silenced={state.silenced}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className="truncate font-display text-sm"
            style={{ color: accentVar(persona.id) }}
          >
            {persona.name}
          </span>
          {speaking && (
            <span
              className="h-1.5 w-1.5 animate-pulse rounded-full"
              style={{ backgroundColor: accentVar(persona.id) }}
              aria-hidden
            />
          )}
        </div>
        <div className="truncate font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          {persona.role}
        </div>
        <div className="flex items-center gap-2 pt-1">
          <StanceChip stance={state.stance} />
          <ConfidencePips level={state.confidence} />
        </div>
        <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {STATUS_LABEL[state.status]}
        </div>
      </div>
    </button>
  );
}
