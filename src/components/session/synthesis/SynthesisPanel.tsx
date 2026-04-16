import type { SynthesisArtifact } from "@/lib/orchestrator/types";
import { DecisionHeader } from "./DecisionHeader";
import { ExportMenu } from "./ExportMenu";
import { KeyArgumentsList } from "./KeyArgumentsList";
import { MinorityViewList } from "./MinorityViewList";
import { NextActionsList } from "./NextActionsList";

export function SynthesisPanel({ artifact }: { artifact: SynthesisArtifact }) {
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-6 py-10">
      <DecisionHeader artifact={artifact} />
      <KeyArgumentsList artifact={artifact} />
      <MinorityViewList artifact={artifact} />
      <NextActionsList artifact={artifact} />
      <ExportMenu artifact={artifact} />
    </div>
  );
}
