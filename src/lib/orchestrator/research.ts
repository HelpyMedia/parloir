/**
 * Phase 0: shared web research before the openings.
 *
 * Debating models argue from their training data, which cannot know recent
 * products, prices or events; grounding generation in retrieved documents
 * is what fixes that (Lewis et al. 2020, Retrieval-Augmented Generation;
 * Nakano et al. 2021, WebGPT, for answers that cite what they retrieved).
 * The research is shared rather than per panelist so every opening starts
 * from the same evidence and stays independent of the other openings:
 * blindness is about each other's arguments, not about the facts.
 *
 * Flow: gate (does this question need the web?) → up to three searches in
 * parallel → an evidence brief that cites the session's source registry.
 * Every side effect is its own durable step. Research is optional: any
 * failure ends in `research_skipped` and the debate runs on the models' own
 * knowledge, with panelists told to flag what they can't verify.
 */

import { pickJudgeModelChain } from "../providers/defaults";
import { hasOpenRouterKey, openRouterSlug } from "../providers/registry";
import { decideResearch } from "../research/gate";
import { writeBrief, type BriefSearch } from "../research/brief";
import { webResearch, webResearchEnabled, type WebResearchResult } from "../research/web";
import { panelModelIds } from "./turn";
import type { DebateDeps } from "./protocol";
import type {
  Participant,
  ResearchOutcome,
  ResearchSkipReason,
  Session,
  SessionSource,
  ToolCall,
  Turn,
} from "./types";

/** Brief step budget: chain of attempts, well under the step limit. */
const BRIEF_BUDGET_MS = 200_000;
/** Each search runs in its own step. */
const SEARCH_TIMEOUT_MS = 90_000;

export const RESEARCH_SPEAKER_ID = "research";

export function researchSpeakerName(session: Session): string {
  return session.protocol.locale === "fr" ? "Recherche" : "Research";
}

/** YYYY-MM-DD in UTC. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The first model in a chain that OpenRouter can run with the web plugin. */
export function webCapableModel(chain: string[]): string | null {
  return chain.find((id) => openRouterSlug(id) !== null) ?? null;
}

export async function runResearchPhase(
  session: Session,
  participants: Participant[],
  deps: DebateDeps,
): Promise<ResearchOutcome> {
  const { ctx, storage, sink, durable } = deps;

  const skip = async (reason: ResearchSkipReason, inPhase: boolean): Promise<ResearchOutcome> => {
    await durable.step("research:skipped", async () => {
      await sink.emit({ type: "research_skipped", reason });
      if (inPhase) await sink.emit({ type: "phase_exit", phase: "research", round: 0, reason: "normal" });
    });
    return { status: "skipped", reason };
  };

  // Read inside a step: a debate paused across a deploy must replay the same way.
  const enabled = await durable.step("research:enabled", async () => webResearchEnabled());
  if (!enabled) return skip("disabled", false);

  const gate = await durable.step("research:gate", async () => {
    await storage.updateSession(session.id, { status: "research", currentRound: 0 });
    await sink.emit({ type: "phase_enter", phase: "research", round: 0 });
    const chain = pickJudgeModelChain(session.protocol.judgeModel, ctx, await panelModelIds(session, participants));
    const decision = await decideResearch({
      question: session.question,
      context: session.context,
      modelChain: chain,
      ctx,
      today: today(),
    });
    return { ...decision, hasKey: hasOpenRouterKey(ctx), searchModel: webCapableModel(chain) };
  });

  if (!gate.needsWeb) return skip("not_needed", true);
  if (!gate.hasKey) return skip("no_openrouter_key", true);
  if (!gate.searchModel) return skip("failed", true);
  const searchModel = gate.searchModel;

  const results = await Promise.all(
    gate.queries.map((query, i) =>
      durable.step(`research:search:${i}`, () =>
        webResearch({ ctx, modelId: searchModel, query, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) }),
      ),
    ),
  );

  if (!results.some((r) => r.ok)) return skip(failureReason(results), true);

  await durable.step("research:brief", async () => {
    const searches: Array<BriefSearch & { result: WebResearchResult }> = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      // Registered in query order so S# numbering follows the brief.
      const sources = r.ok
        ? await storage.appendSources(
            session.id,
            r.sources.map((s) => ({ ...s, foundBy: RESEARCH_SPEAKER_ID, phase: "research" as const, round: 0 })),
          )
        : [];
      searches.push({ query: gate.queries[i], summary: r.ok ? r.summary : "", sources, result: r });
    }
    const ok = searches.filter((s) => s.result.ok);
    const chain = pickJudgeModelChain(session.protocol.judgeModel, ctx, await panelModelIds(session, participants));
    const brief = await writeBrief({
      question: session.question,
      searches: ok,
      modelChain: chain,
      ctx,
      today: today(),
      deadline: Date.now() + BRIEF_BUDGET_MS,
    });

    const sources = uniqueById(ok.flatMap((s) => s.sources));
    const toolCalls: ToolCall[] = searches.map((s, i) => ({
      id: `research-${i}`,
      toolName: "web_search",
      args: { query: s.query },
      result: s.result.ok
        ? { summary: s.summary, sources: s.sources.map(({ id, title, url }) => ({ id, title, url })) }
        : { error: s.result.code },
      durationMs: 0,
    }));
    const spent = ok.reduce(
      (acc, s) => {
        if (!s.result.ok) return acc;
        return {
          cost: acc.cost + s.result.costUsd,
          tokensIn: acc.tokensIn + s.result.tokensIn,
          tokensOut: acc.tokensOut + s.result.tokensOut,
        };
      },
      { cost: brief.costUsd, tokensIn: brief.tokensIn, tokensOut: brief.tokensOut },
    );

    const turn: Turn = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      phase: "research",
      roundNumber: 0,
      // Sorts ahead of the openings, which share round 0.
      turnIndex: -1,
      speakerRole: "researcher",
      speakerId: RESEARCH_SPEAKER_ID,
      speakerName: researchSpeakerName(session),
      content: brief.text,
      toolCalls,
      references: [],
      tokensIn: spent.tokensIn,
      tokensOut: spent.tokensOut,
      costUsd: spent.cost,
      model: brief.modelId || searchModel,
      createdAt: new Date(),
    };
    await storage.appendTurn(turn);
    await sink.emit({ type: "turn_complete", turn });
    await sink.emit({ type: "research_complete", turnId: turn.id, sources });
    await sink.emit({ type: "phase_exit", phase: "research", round: 0, reason: "normal" });
  });

  return { status: "complete" };
}

/** Out of credits is the most actionable reason, so it wins. */
function failureReason(results: WebResearchResult[]): ResearchSkipReason {
  const codes = results.map((r) => (r.ok ? null : r.code));
  if (codes.includes("no_credits")) return "no_credits";
  if (codes.includes("no_openrouter_key")) return "no_openrouter_key";
  return "failed";
}

function uniqueById(sources: SessionSource[]): SessionSource[] {
  const seen = new Map<string, SessionSource>();
  for (const s of sources) if (!seen.has(s.id)) seen.set(s.id, s);
  return [...seen.values()];
}
