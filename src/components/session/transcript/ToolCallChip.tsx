import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import type { ToolCall } from "@/lib/orchestrator/types";

interface FoundSource {
  id: string;
  title: string;
  url: string;
}

function searchOutcome(result: unknown): { sources: FoundSource[]; failed: boolean } {
  if (!result || typeof result !== "object") return { sources: [], failed: false };
  if ("error" in result) return { sources: [], failed: true };
  const list = (result as { sources?: unknown }).sources;
  const sources = Array.isArray(list)
    ? list.filter(
        (s): s is FoundSource =>
          Boolean(s) && typeof s.id === "string" && typeof s.url === "string" && typeof s.title === "string",
      )
    : [];
  return { sources, failed: false };
}

export function ToolCallChip({ toolCall }: { toolCall: ToolCall }) {
  const t = useTranslations("Council");
  const pending = toolCall.result === null || toolCall.result === undefined;
  const query = typeof toolCall.args?.query === "string" ? toolCall.args.query : "";

  if (toolCall.toolName === "web_search" && query) {
    const { sources, failed } = searchOutcome(toolCall.result);
    return (
      <div className="flex flex-col gap-1">
        <span
          className="inline-flex max-w-full items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]"
          style={{ borderColor: "var(--color-evidence)", color: "var(--color-evidence)", opacity: pending ? 0.7 : 1 }}
        >
          <Search className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate">
            {pending ? t("searching", { query }) : failed ? t("searchUnavailable", { query }) : t("searched", { query })}
          </span>
        </span>
        {sources.length > 0 && (
          <ul className="flex flex-wrap gap-x-3 gap-y-0.5 pl-1 text-[11px] text-[var(--color-text-muted)]">
            {sources.map((s) => (
              <li key={s.id} className="max-w-full truncate">
                <span className="font-mono text-[10px] text-[var(--color-text-dim)]">[{s.id}]</span>{" "}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-[var(--color-evidence)]"
                >
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide"
      style={{
        borderColor: "var(--color-evidence)",
        color: "var(--color-evidence)",
        opacity: pending ? 0.7 : 1,
      }}
    >
      <Search className="h-3 w-3" />
      {toolCall.toolName}
      {pending && <span className="text-[var(--color-text-dim)]">…</span>}
    </span>
  );
}
