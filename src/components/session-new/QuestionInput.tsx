"use client";

import type { ReactNode } from "react";

interface Props {
  title: string;
  question: string;
  onTitle: (v: string) => void;
  onQuestion: (v: string) => void;
  titleAnimationKey?: number;
  suggestSlot?: ReactNode;
}

export function QuestionInput({
  title,
  question,
  onTitle,
  onQuestion,
  titleAnimationKey,
  suggestSlot,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="session-title"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]"
        >
          Session title
        </label>
        <input
          id="session-title"
          key={titleAnimationKey}
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="GTM strategy for product X"
          maxLength={200}
          className={
            "w-full rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-2.5 font-display text-lg text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-spot-warm)] focus:outline-none" +
            (titleAnimationKey !== undefined ? " parloir-suggest-fade-in" : "")
          }
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="session-question"
          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]"
        >
          The question for the council
        </label>
        <textarea
          id="session-question"
          value={question}
          onChange={(e) => onQuestion(e.target.value)}
          placeholder="What is the best GTM strategy for our product launch this quarter, given current team capacity?"
          rows={5}
          maxLength={4000}
          className="w-full resize-none rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-3 text-base leading-relaxed text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-spot-warm)] focus:outline-none"
        />
        <div className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
          <span className="flex items-center gap-3">
            <span>Min 10, max 4000 characters</span>
            <span>{question.length} / 4000</span>
          </span>
          {suggestSlot}
        </div>
      </div>
    </div>
  );
}
