"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { InterjectInput } from "./InterjectInput";
import { InterjectSuggestions } from "./InterjectSuggestions";

interface Props {
  prompt: string | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function PausedOverlay({ prompt, onSubmit, onCancel }: Props) {
  const [seed, setSeed] = useState("");
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[var(--color-bg-chamber)]/70 px-6 backdrop-blur-sm"
    >
      <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
        Session paused
      </span>
      <InterjectInput prompt={prompt} initial={seed} onSubmit={onSubmit} onCancel={onCancel} />
      <InterjectSuggestions onPick={setSeed} />
    </motion.div>
  );
}
