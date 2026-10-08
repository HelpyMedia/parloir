"use client";

import { useTranslations } from "next-intl";
import type { Persona } from "@/lib/orchestrator/types";
import type { UIPersonaState } from "@/lib/session-ui/types";
import { PersonaCard } from "./PersonaCard";

interface Props {
  personas: Persona[];
  personaState: Record<string, UIPersonaState>;
  onSelect?: (personaId: string) => void;
}

export function PersonaRail({ personas, personaState, onSelect, models }: Props & { models?: Record<string, string> }) {
  const t = useTranslations("Council");
  return (
    <aside
      aria-label={t("councilLabel")}
      className="hidden w-60 shrink-0 flex-col gap-3 border-r lg:flex border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-4 py-4"
    >
      <div className="font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {t("council")}
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
          return (
            <PersonaCard
              key={p.id}
              persona={p}
              state={state}
              model={models?.[p.id]}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </aside>
  );
}
