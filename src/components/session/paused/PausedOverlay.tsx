"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { InterjectInput } from "./InterjectInput";
import { InterjectSuggestions } from "./InterjectSuggestions";

interface Props {
  prompt: string | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  /** Shown instead of the note input, e.g. when the pause is for a failed model. */
  replacement?: ReactNode;
}

export function PausedOverlay({ prompt, onSubmit, onCancel, replacement }: Props) {
  const t = useTranslations("Council");
  const [seed, setSeed] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);
  const hasReplacement = Boolean(replacement);
  // A pause that needs a decision (a failed model) brings itself into view;
  // the transcript may have scrolled the page past the stage.
  useEffect(() => {
    if (hasReplacement) contentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [hasReplacement]);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="absolute inset-0 z-40 overflow-y-auto bg-[var(--color-bg-chamber)]/70 backdrop-blur-sm"
    >
      {/* Centered when it fits, scrollable when taller than the stage (phones). */}
      <div ref={contentRef} className="flex min-h-full flex-col items-center justify-center gap-4 px-6 py-6">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
          {t("paused")}
        </span>
        {replacement ?? (
          <>
            <InterjectInput prompt={prompt ? t("pausedPrompt") : null} initial={seed} onSubmit={onSubmit} onCancel={onCancel} />
            <InterjectSuggestions onPick={setSeed} />
          </>
        )}
      </div>
    </motion.div>
  );
}
