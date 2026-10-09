import type { SessionSource } from "@/lib/orchestrator/types";

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Numbered pages, titles linking out. Shared by the research card and the deliverable. */
export function SourceList({ sources }: { sources: Pick<SessionSource, "id" | "title" | "url">[] }) {
  return (
    <ol className="space-y-1.5">
      {sources.map((s) => (
        <li key={s.id} className="flex gap-2 text-sm leading-snug">
          <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-dim)]">[{s.id}]</span>
          <span className="min-w-0">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="break-words text-[var(--color-text-primary)] underline underline-offset-2 hover:text-[var(--color-evidence)]"
            >
              {s.title || s.url}
            </a>
            <span className="ml-2 font-mono text-[10px] text-[var(--color-text-dim)]">{hostOf(s.url)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
