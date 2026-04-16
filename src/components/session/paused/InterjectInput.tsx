"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface Props {
  prompt?: string | null;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  initial?: string;
}

export function InterjectInput({ prompt, onSubmit, onCancel, initial = "" }: Props) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  useEffect(() => {
    if (initial) setValue(initial);
  }, [initial]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSubmit(value.trim());
      }}
      className="flex w-full max-w-[640px] flex-col gap-3 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface-card)] p-5 shadow-lg"
    >
      {prompt && (
        <p className="font-display text-sm italic text-[var(--color-spot-warm)]">
          {prompt}
        </p>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Interject — your message will be inserted at the next turn boundary."
        rows={3}
        className="resize-none rounded-md border border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-spot-warm)] focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
        >
          Resume without interjecting
        </button>
        <button
          type="submit"
          disabled={!value.trim()}
          className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--color-spot-warm)] px-3 py-1.5 text-sm text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-halo)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </div>
    </form>
  );
}
