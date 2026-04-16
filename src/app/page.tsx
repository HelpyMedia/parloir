import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";
import { PhaseBadge } from "@/components/session/shared/PhaseBadge";

export const dynamic = "force-dynamic";

async function listRecentSessions() {
  return db
    .select({
      id: sessions.id,
      title: sessions.title,
      status: sessions.status,
      currentRound: sessions.currentRound,
      createdAt: sessions.createdAt,
    })
    .from(sessions)
    .orderBy(desc(sessions.createdAt))
    .limit(10);
}

function formatRelative(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default async function Home() {
  const recent = await listRecentSessions().catch(() => []);

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-10 px-6 py-16">
      <header className="space-y-3 text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.3em] text-[var(--color-spot-warm)]">
          Parloir
        </span>
        <h1 className="font-display text-4xl text-[var(--color-text-primary)]">
          The council is in session.
        </h1>
        <p className="mx-auto max-w-[52ch] text-[var(--color-text-muted)]">
          Convene a panel of AI personas to deliberate a question through a
          structured protocol and produce a synthesized deliverable.
        </p>
      </header>

      <div className="flex justify-center">
        <Link
          href="/sessions/new"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-spot-warm)] bg-[var(--color-spot-halo)] px-6 py-3 font-display text-base text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-warm)]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
        >
          <Plus className="h-4 w-4" />
          New session
        </Link>
      </div>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
          Recent sessions
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] p-4 text-sm text-[var(--color-text-muted)]">
            No sessions yet. Start one above.
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-card)] px-4 py-3 transition-colors hover:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-base text-[var(--color-text-primary)]">
                      {s.title}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                      {formatRelative(s.createdAt)}
                    </div>
                  </div>
                  <PhaseBadge phase={s.status} round={s.currentRound} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
