import type { ReactNode } from "react";

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

export function LegalPage({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-col gap-8 px-4 py-12 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl text-[var(--color-text-primary)]">{title}</h1>
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
          {updated}
        </p>
      </header>
      <div className="text-sm leading-relaxed text-[var(--color-text-muted)]">{intro}</div>
      {sections.map((s) => (
        <section key={s.heading} className="flex flex-col gap-2">
          <h2 className="font-display text-lg text-[var(--color-text-primary)]">{s.heading}</h2>
          <div className="flex flex-col gap-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {s.body}
          </div>
        </section>
      ))}
    </main>
  );
}

/** Operator contact shown on legal pages; set PARLOIR_CONTACT_EMAIL in production. */
export function contactEmail(): string | null {
  return process.env.PARLOIR_CONTACT_EMAIL || null;
}
