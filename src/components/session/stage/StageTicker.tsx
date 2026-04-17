"use client";

import { motion } from "framer-motion";
import { accentVar } from "@/lib/session-ui/persona-accent";

interface Props {
  speakerId: string;
  speakerName: string;
  text: string;
  /** Max chars of the tail to show. */
  limit?: number;
  /** "stage" shows a centered bubble; "bar" is a single-line inline variant. */
  variant?: "stage" | "bar";
}

/**
 * Rolling tail of the active speaker's streaming reply. Always trails the
 * latest tokens so the user never needs to scroll to "see what they're
 * saying right now" — full turn content lives in the transcript drawer.
 */
export function StageTicker({
  speakerId,
  speakerName,
  text,
  limit = 140,
  variant = "stage",
}: Props) {
  const color = accentVar(speakerId);
  const tail = text.length > limit ? `…${text.slice(-limit).trimStart()}` : text;

  if (variant === "bar") {
    return (
      <motion.div
        key={speakerId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex min-w-0 flex-1 items-center gap-2 font-mono text-[11px] text-[var(--color-text-muted)]"
        aria-live="polite"
      >
        <span
          className="h-1.5 w-1.5 flex-none animate-pulse rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="flex-none font-display text-[13px]" style={{ color }}>
          {speakerName}
        </span>
        <span className="truncate opacity-80">{tail || "…"}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      key={speakerId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pointer-events-none absolute bottom-4 left-1/2 z-10 w-full max-w-[560px] -translate-x-1/2 px-4"
      aria-live="polite"
    >
      <div
        className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)]/90 p-3 text-sm leading-relaxed text-[var(--color-text-primary)] shadow-lg backdrop-blur-sm"
        style={{ borderLeftColor: color, borderLeftWidth: 2 }}
      >
        <div
          className="mb-1 font-mono text-[10px] uppercase tracking-[0.2em]"
          style={{ color }}
        >
          {speakerName}
        </div>
        <div className="line-clamp-3 whitespace-pre-wrap break-words">
          {tail || "…"}
          <span
            className="ml-0.5 inline-block h-3 w-[2px] animate-pulse align-middle"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        </div>
      </div>
    </motion.div>
  );
}
