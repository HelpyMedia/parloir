import { Search } from "lucide-react";
import type { ToolCall } from "@/lib/orchestrator/types";

export function ToolCallChip({ toolCall }: { toolCall: ToolCall }) {
  const pending = toolCall.result === null || toolCall.result === undefined;
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
