"use client";

import { Download } from "lucide-react";
import type { SynthesisArtifact } from "@/lib/orchestrator/types";

export function ExportMenu({ artifact }: { artifact: SynthesisArtifact }) {
  const downloadMarkdown = () => {
    const blob = new Blob([artifact.transcriptMarkdown || artifact.decision], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parloir-session-${artifact.sessionId.slice(0, 8)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={downloadMarkdown}
        className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-[var(--color-spot-warm)] px-3 py-1.5 text-sm text-[var(--color-spot-warm)] transition-colors hover:bg-[var(--color-spot-halo)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-spot-warm)]"
      >
        <Download className="h-4 w-4" />
        Export markdown
      </button>
    </div>
  );
}
