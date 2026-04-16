"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { accentVar } from "@/lib/session-ui/persona-accent";
import type { Turn } from "@/lib/orchestrator/types";
import { ReferenceChip } from "./ReferenceChip";
import { ToolCallChip } from "./ToolCallChip";

interface Props {
  turn: Turn;
  live?: boolean;
  onJumpToRef?: (turnId: string) => void;
}

const CONDENSED_CHARS = 420;

export function TurnCard({ turn, live, onJumpToRef }: Props) {
  const [expanded, setExpanded] = useState(false);
  const showFull = live || expanded || turn.content.length <= CONDENSED_CHARS;
  const displayed = showFull
    ? turn.content
    : `${turn.content.slice(0, CONDENSED_CHARS).trimEnd()}…`;

  const color = accentVar(turn.speakerId);

  return (
    <motion.article
      id={`turn-${turn.id}`}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-4"
    >
      <header className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-display text-base" style={{ color }}>
          {turn.speakerName}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          {turn.phase} · R{turn.roundNumber} · T{turn.turnIndex}
        </span>
        {live && (
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
        <span className="ml-auto font-mono text-[10px] text-[var(--color-text-dim)]">
          {turn.tokensIn}→{turn.tokensOut} · ${turn.costUsd.toFixed(4)}
        </span>
      </header>

      <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-primary)] [max-width:72ch]">
        {displayed}
        {live && (
          <span
            className="ml-0.5 inline-block h-4 w-[2px] animate-pulse align-middle"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        )}
      </div>

      {!showFull && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 cursor-pointer font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-spot-warm)]"
        >
          Expand turn ›
        </button>
      )}

      {(turn.toolCalls?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {turn.toolCalls!.map((tc) => (
            <ToolCallChip key={tc.id} toolCall={tc} />
          ))}
        </div>
      )}

      {(turn.references?.length ?? 0) > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
            Cites
          </span>
          {turn.references!.map((ref) => (
            <ReferenceChip key={ref} turnId={ref} onJump={onJumpToRef} />
          ))}
        </div>
      )}
    </motion.article>
  );
}
