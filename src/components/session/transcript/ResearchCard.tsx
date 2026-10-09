"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import type { SessionSource, Turn } from "@/lib/orchestrator/types";
import { SourceList } from "./SourceList";
import { TurnMarkdown } from "./TurnMarkdown";

/** The evidence brief, before the openings: what was searched, what was found. */
export function ResearchCard({ turn, sources }: { turn: Turn; sources: SessionSource[] }) {
  const t = useTranslations("Council");
  const queries = (turn.toolCalls ?? [])
    .map((tc) => (typeof tc.args?.query === "string" ? tc.args.query : ""))
    .filter(Boolean);
  const found = sources.filter((s) => s.foundBy === "research");

  return (
    <motion.article
      id={`turn-${turn.id}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="rounded-lg border border-[var(--color-evidence)]/40 bg-[var(--color-surface-card)] p-4"
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <Globe className="h-4 w-4 text-[var(--color-evidence)]" aria-hidden />
        <span className="font-display text-base text-[var(--color-evidence)]">{turn.speakerName}</span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          {t("researchBrief")}
        </span>
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-dim)]">${turn.costUsd.toFixed(4)}</span>
      </header>

      {queries.length > 0 && (
        <p className="mb-3 text-xs text-[var(--color-text-muted)]">
          {t("researchQueries", { queries: queries.map((q) => `“${q}”`).join(" · ") })}
        </p>
      )}

      <TurnMarkdown content={turn.content} sources={sources} />

      {found.length > 0 && (
        <details className="mt-3 rounded border border-[var(--color-border-subtle)] px-3 py-2">
          <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-evidence)]">
            {t("researchSources", { count: found.length })}
          </summary>
          <div className="mt-2">
            <SourceList sources={found} />
          </div>
        </details>
      )}
    </motion.article>
  );
}
