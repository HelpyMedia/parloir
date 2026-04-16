"use client";

import type { Persona } from "@/lib/orchestrator/types";
import { PersonaAvatar } from "../session/shared/PersonaAvatar";
import { accentVar } from "@/lib/session-ui/persona-accent";

interface Props {
  personas: Persona[];
  selected: string[];
  onToggle: (personaId: string) => void;
}

export function PersonaChecklist({ personas, selected, onToggle }: Props) {
  return (
    <fieldset className="space-y-2">
      <legend className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        Personas (pick 2–5)
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {personas.map((p) => {
          const checked = selected.includes(p.id);
          return (
            <label
              key={p.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-[var(--color-spot-warm)]"
              style={{
                borderColor: checked ? "var(--color-spot-warm)" : "var(--color-border-subtle)",
                backgroundColor: checked ? "var(--color-spot-halo)" : "var(--color-surface-card)",
              }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(p.id)}
                className="sr-only"
              />
              <PersonaAvatar personaId={p.id} name={p.name} size="md" active={checked} />
              <div className="min-w-0 flex-1">
                <div
                  className="font-display text-base"
                  style={{ color: accentVar(p.id) }}
                >
                  {p.name}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                  {p.role}
                </div>
                <div className="mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
                  {p.model}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
