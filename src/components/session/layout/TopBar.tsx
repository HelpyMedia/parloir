import Link from "next/link";
import { PhaseBadge } from "../shared/PhaseBadge";
import type { Phase, Session } from "@/lib/orchestrator/types";

interface Props {
  session: Session;
  phase: Phase;
  round: number;
  totalCostUsd: number;
}

export function TopBar({ session, phase, round, totalCostUsd }: Props) {
  return (
    <header className="flex h-14 items-center justify-between gap-6 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-chamber)] px-6">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="font-display text-lg tracking-tight text-[var(--color-spot-warm)] transition-opacity hover:opacity-80"
          aria-label="Back to home"
        >
          Parloir
        </Link>
        <span className="h-4 w-px bg-[var(--color-border-subtle)]" />
        <h1 className="max-w-[40ch] truncate font-display text-base text-[var(--color-text-primary)]">
          {session.title}
        </h1>
      </div>
      <div className="flex items-center gap-3">
        <span className="rounded border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
          Decide
        </span>
        <span className="rounded border border-[var(--color-border-subtle)] px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)]">
          Mixed council
        </span>
        <PhaseBadge phase={phase} round={round} />
        <span className="font-mono text-xs text-[var(--color-text-dim)]">
          ${totalCostUsd.toFixed(3)}
        </span>
        <Link
          href="/sessions/new"
          className="rounded border border-[var(--color-border-subtle)] px-3 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-spot-warm)] hover:text-[var(--color-spot-warm)]"
        >
          New session
        </Link>
      </div>
    </header>
  );
}
