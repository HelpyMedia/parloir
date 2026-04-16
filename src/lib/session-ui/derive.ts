import type { UISession } from "./types";

export interface InsightView {
  currentBest: string | null;
  consensusLevel: number;
  keyTension: string | null;
  unresolved: string[];
  sourcesUsed: number;
}

export function deriveInsights(state: UISession): InsightView {
  const latest = state.consensusReports.at(-1) ?? null;
  return {
    currentBest: latest?.majorityPosition ?? null,
    consensusLevel: latest?.consensusLevel ?? 0,
    keyTension: latest?.minorityPositions[0]?.position ?? null,
    unresolved: latest?.unresolvedQuestions ?? [],
    sourcesUsed: countSources(state),
  };
}

function countSources(state: UISession): number {
  const seen = new Set<string>();
  for (const turn of state.turns) {
    for (const ref of turn.references ?? []) seen.add(ref);
    for (const tc of turn.toolCalls ?? []) {
      if (tc.toolName) seen.add(`tool:${tc.id}`);
    }
  }
  return seen.size;
}
