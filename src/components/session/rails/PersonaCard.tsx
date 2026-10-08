"use client";

import { useTranslations } from "next-intl";
import { PersonaAvatar } from "../shared/PersonaAvatar";
import { accentVar } from "@/lib/session-ui/persona-accent";
import type { Persona } from "@/lib/orchestrator/types";
import type { PersonaStatus, UIPersonaState } from "@/lib/session-ui/types";

interface Props {
  persona: Persona;
  state: UIPersonaState;
  /** The model this panelist runs on, shown instead of an unused stance chip. */
  model?: string;
  onSelect?: (personaId: string) => void;
}

const STATUS_LABEL: Record<PersonaStatus, string> = {
  listening: "statusListening",
  speaking: "statusSpeaking",
  researching: "statusResearching",
  revising: "statusRevising",
  challenging: "statusChallenging",
  waiting: "statusWaiting",
  synthesizing: "statusSynthesizing",
  silenced: "statusSilenced",
};

export function PersonaCard({ persona, state, model, onSelect }: Props) {
  const t = useTranslations("Council");
  const tRole = useTranslations("Personas");
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
          {tRole.has(persona.id) ? tRole(persona.id) : persona.role}
        </div>
        {model && (
          <div className="truncate font-mono text-[10px] text-[var(--color-text-muted)]" title={model}>
            {model.replace(/^openrouter\//, "")}
          </div>
        )}
        <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
          {t(STATUS_LABEL[state.status])}
        </div>
      </div>
    </button>
  );
}
