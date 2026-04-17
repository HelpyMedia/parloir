"use client";

import { motion } from "framer-motion";
import { useLayoutEffect, useRef, useState } from "react";
import { accentVar } from "@/lib/session-ui/persona-accent";
import { stripMarkdownForTicker } from "@/lib/session-ui/strip-markdown";

interface Props {
  speakerId: string;
  speakerName: string;
  text: string;
  /** Max chars of the tail to show (stage bubble variant only). */
  limit?: number;
  /** "stage" = floating bubble over the table. "bar" = single-line inline. */
  variant?: "stage" | "bar";
}

/**
 * Rolling tail of the active speaker's streaming reply, cleaned of markdown
 * and whitespace noise so it reads as prose regardless of what the model
 * writes. Full turn content lives in the transcript drawer.
 */
export function StageTicker({
  speakerId,
  speakerName,
  text,
  limit = 160,
  variant = "stage",
}: Props) {
  const color = accentVar(speakerId);
  const cleaned = stripMarkdownForTicker(text);

  if (variant === "bar") {
    return <TickerBar speakerId={speakerId} speakerName={speakerName} color={color} text={cleaned} />;
  }

  const truncated = cleaned.length > limit;
  const tail = truncated ? `…${cleaned.slice(-limit).trimStart()}` : cleaned;

  return (
    <motion.div
      key={speakerId}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="pointer-events-none absolute bottom-4 left-1/2 z-10 w-full max-w-[560px] -translate-x-1/2 px-4"
      aria-live="polite"
    >
      <div
        className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)]/90 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-md"
        style={{ borderLeftColor: color, borderLeftWidth: 2 }}
      >
        <div
          className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{ color }}
        >
          <span
            className="h-1 w-1 animate-pulse rounded-full"
            style={{ backgroundColor: color }}
            aria-hidden
          />
          {speakerName}
        </div>
        <div
          className="line-clamp-2 text-[13px] leading-[1.55] text-[var(--color-text-primary)]"
          style={{ wordBreak: "break-word" }}
        >
          {tail || "…"}
          <span
            className="ml-0.5 inline-block h-3 w-[2px] animate-pulse align-[-1px]"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Marquee-style bar ticker. Renders the full cleaned text on a single line,
 * translated left so the tail sits flush against the container's right edge.
 * The translate animates on every text change, so new tokens glide in from
 * the right instead of popping in. Once the text fits, the offset sits at 0.
 */
function TickerBar({
  speakerId,
  speakerName,
  color,
  text,
}: {
  speakerId: string;
  speakerName: string;
  color: string;
  text: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [offset, setOffset] = useState(0);
  const prevSpeakerRef = useRef(speakerId);

  useLayoutEffect(() => {
    if (!containerRef.current || !textRef.current) return;
    const containerW = containerRef.current.offsetWidth;
    const textW = textRef.current.scrollWidth;
    const target = textW > containerW ? containerW - textW : 0;
    setOffset(target);
  }, [text]);

  // Reset offset instantly when the speaker changes so the new speaker's
  // text doesn't inherit the prior speaker's scroll position.
  const speakerChanged = prevSpeakerRef.current !== speakerId;
  if (speakerChanged) {
    prevSpeakerRef.current = speakerId;
  }

  return (
    <motion.div
      key={speakerId}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="flex min-w-0 flex-1 items-center gap-3"
      aria-live="polite"
    >
      <span className="flex flex-none items-center gap-2">
        <span
          className="h-1.5 w-1.5 animate-pulse rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span
          className="font-display text-[13px] leading-none tracking-tight"
          style={{ color }}
        >
          {speakerName.split(" ").slice(-1)[0]}
        </span>
      </span>
      <div
        ref={containerRef}
        className="relative min-w-0 flex-1 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to right, transparent 0, black 24px, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 24px, black 100%)",
        }}
      >
        <motion.span
          ref={textRef}
          animate={{ x: speakerChanged ? 0 : offset }}
          initial={false}
          transition={{
            duration: 0.55,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="inline-block whitespace-nowrap font-mono text-[12px] leading-none text-[var(--color-text-muted)]"
        >
          {text || "…"}
        </motion.span>
      </div>
    </motion.div>
  );
}
