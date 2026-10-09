import { useTranslations } from "next-intl";
import type { SynthesisArtifact } from "@/lib/orchestrator/types";
import { SourceList } from "../transcript/SourceList";

/** The pages the deliverable cites, from the session's registry. */
export function SourcesSection({ artifact }: { artifact: SynthesisArtifact }) {
  const t = useTranslations("Council");
  if (!artifact.sources?.length) return null;
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-dim)]">
        {t("sourcesTitle")}
      </h2>
      <SourceList sources={artifact.sources} />
    </section>
  );
}
