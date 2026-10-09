/**
 * One agent turn: prompt construction, the streamed model call, and turning
 * failures into a recorded outcome instead of an exception.
 *
 * A single flaky model must not take the whole debate down. runAgentTurn
 * never throws for model errors; it emits `turn_failed` and returns a
 * failure outcome the protocol can reason about (skip the speaker, drop
 * them after repeated failures, or abort when the error is account-wide).
 */

import { streamText, stepCountIs } from "ai";
import { resolveModel } from "../providers/registry";
import { loadPersona } from "../personas";
import { buildToolset } from "../tools";
import { extractCostUsd } from "./pricing";
import { describeModelError, type ModelErrorCode } from "./model-errors";
import { evidenceBlock } from "../research/sources";
import type {
  Participant,
  Persona,
  Phase,
  ProviderContext,
  ResearchOutcome,
  Session,
  SessionSource,
  Turn,
} from "./types";
import type { Storage, StreamSink } from "./protocol";

/** Hard ceiling per turn. Keeps one step well under serverless limits. */
export const TURN_TIMEOUT_MS = 150_000;
/** Generous enough for reasoning models; length is steered by the prompt. */
const MAX_OUTPUT_TOKENS = 4_000;

export type TurnOutcome =
  | { ok: true; personaId: string; turnId: string }
  | { ok: false; personaId: string; code: ModelErrorCode; message: string };

export function participantModelId(session: Session, persona: Persona): string {
  return session.participantModelOverrides?.[persona.id] || persona.model;
}

/** Every seat's model, in participant order. */
export async function panelModelIds(session: Session, participants: Participant[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of participants) {
    out.push(participantModelId(session, await loadPersona(p.personaId)));
  }
  return out;
}

export function resolveFor(ctx: ProviderContext, modelId: string) {
  return ctx.resolveModel ? ctx.resolveModel(modelId) : resolveModel(modelId, ctx);
}

export async function runAgentTurn(params: {
  session: Session;
  personaId: string;
  ctx: ProviderContext;
  phase: Phase;
  roundNumber: number;
  /** Fixed index for parallel turns (opening), where counting rows would race. */
  turnIndex?: number;
  storage: Storage;
  sink: StreamSink;
  /** What the research phase produced; absent for sessions that predate it. */
  research?: ResearchOutcome;
}): Promise<TurnOutcome> {
  const { session, personaId, ctx, phase, roundNumber, storage, sink } = params;

  const persona = await loadPersona(personaId);
  const modelId = participantModelId(session, persona);

  // Opening is blind: speakers never see each other's opening statements.
  // The evidence brief is not another speaker, so everyone reads it.
  const transcript = await storage.getTranscript(session.id);
  const debateTurns = transcript.filter((t) => t.phase !== "research");
  const visibleHistory = phase === "opening" ? [] : debateTurns;
  const evidence = await loadEvidence(transcript, session.id, storage);
  const turnIndex =
    params.turnIndex ??
    transcript.filter((t) => t.phase === phase && t.roundNumber === roundNumber).length;

  await sink.emit({
    type: "turn_start",
    speakerId: persona.id,
    speakerName: persona.name,
    phase,
  });

  try {
    const tools = await buildToolset(persona.toolIds, session.id);
    const result = streamText({
      model: resolveFor(ctx, modelId),
      messages: buildMessages({
        session,
        persona,
        phase,
        roundNumber,
        visibleHistory,
        evidence,
        research: params.research,
      }),
      temperature: persona.temperature,
      tools,
      // AI SDK 5 stops after one step by default; allow a couple of tool hops.
      stopWhen: stepCountIs(Object.keys(tools).length > 0 ? 5 : 1),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TURN_TIMEOUT_MS),
      providerOptions: {
        openrouter: {
          // Authoritative USD cost comes back in the final usage chunk.
          usage: { include: true },
          // Debates are latency-sensitive; ignored by non-reasoning models.
          reasoning: { effort: "low", exclude: true },
        },
      },
    });

    let fullText = "";
    let streamError: unknown = null;
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        fullText += part.text;
        await sink.emit({ type: "turn_delta", speakerId: persona.id, textDelta: part.text });
      } else if (part.type === "error") {
        streamError = part.error;
      }
    }
    if (streamError) throw streamError;
    if (fullText.trim().length === 0) throw new Error("no output generated (empty)");

    const usage = await result.usage;
    const tokensIn = usage.inputTokens ?? 0;
    const tokensOut = usage.outputTokens ?? 0;
    const costUsd = extractCostUsd(await result.providerMetadata, modelId, tokensIn, tokensOut);

    const turn: Turn = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      phase,
      roundNumber,
      turnIndex,
      speakerRole: "agent",
      speakerId: persona.id,
      speakerName: persona.name,
      content: fullText,
      references: extractReferences(fullText, visibleHistory),
      tokensIn,
      tokensOut,
      costUsd,
      model: modelId,
      createdAt: new Date(),
    };

    await storage.appendTurn(turn);
    await sink.emit({ type: "turn_complete", turn });
    await storage.recordModelOutcome(modelId, null);
    return { ok: true, personaId: persona.id, turnId: turn.id };
  } catch (err) {
    const info = describeModelError(err);
    console.warn("[turn] failed", { sessionId: session.id, personaId, modelId, code: info.code, err });
    await sink.emit({
      type: "turn_failed",
      speakerId: persona.id,
      speakerName: persona.name,
      phase,
      modelId,
      code: info.code,
      message: info.message,
    });
    await storage.recordModelOutcome(modelId, info.code);
    return { ok: false, personaId: persona.id, code: info.code, message: info.message };
  }
}

/** The research brief and every registered source, or null without research. */
export async function loadEvidence(
  transcript: Turn[],
  sessionId: string,
  storage: Storage,
): Promise<{ brief: string; sources: SessionSource[] } | null> {
  const brief = transcript.find((t) => t.phase === "research");
  if (!brief) return null;
  return { brief: brief.content, sources: await storage.getSources(sessionId) };
}

/** Research couldn't run, so the panel must say what it can't verify. */
export function researchUnavailable(research: ResearchOutcome | undefined): boolean {
  return research?.status === "skipped" && research.reason !== "not_needed";
}

const CITATION_RULE =
  "Cite evidence as [S#], using only the IDs in the evidence brief's source list. Mark claims " +
  "not backed by a source as your own knowledge. Never invent sources or URLs.";

const NO_RESEARCH_RULE =
  "No live web research was available for this session. Say plainly when a point depends on " +
  "information you can't verify, such as recent products or prices.";

const LANGUAGE_RULE =
  "Always write in the same language as the QUESTION (for example, answer in French if the question is in French).";

function buildMessages(params: {
  session: Session;
  persona: Persona;
  phase: Phase;
  roundNumber: number;
  visibleHistory: Turn[];
  evidence: { brief: string; sources: SessionSource[] } | null;
  research: ResearchOutcome | undefined;
}) {
  const { session, persona, phase, roundNumber, visibleHistory, evidence, research } = params;
  const protocol = session.protocol;
  const requireNovelty = protocol.requireNovelty && phase !== "opening";

  const systemParts = [
    persona.systemPrompt,
    LANGUAGE_RULE,
    // Models otherwise assume their training cutoff is today.
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
  ];
  if (evidence) systemParts.push(CITATION_RULE);
  else if (researchUnavailable(research)) systemParts.push(NO_RESEARCH_RULE);

  systemParts.push(
    "Keep each contribution focused: roughly 150 to 300 words, short paragraphs or a few bullets. " +
      "Other participants and a human are reading along live.",
  );

  if (protocol.hideConfidenceScores) {
    systemParts.push(
      "Do not mention confidence scores, percentages, or phrases like " +
        '"I\'m X% sure". State your position and reasoning without quantified certainty.',
    );
  }

  if (phase === "opening") {
    systemParts.push(
      "This is your OPENING STATEMENT. You have not yet seen what other participants think. " +
        "Answer the question from your own perspective and expertise. Be specific and substantive.",
    );
  } else if (phase === "critique") {
    const base = `This is CRITIQUE ROUND ${roundNumber}. You can see everyone's prior statements. `;
    systemParts.push(
      requireNovelty
        ? base +
            "You MUST do ONE of the following: " +
            "(a) Refine your position with NEW reasoning or evidence you haven't given before, OR " +
            "(b) Critique a SPECIFIC participant by name, citing their actual argument, OR " +
            "(c) Explicitly concede a point someone else made and explain why you changed your mind. " +
            "Do NOT simply agree or restate. Do NOT be sycophantic. Bring something the group doesn't have yet."
        : base + "Respond to what others have said and refine your position as you see fit.",
    );
  } else if (phase === "adaptive_round") {
    systemParts.push(
      "This is the FINAL ADAPTIVE ROUND. The moderator has identified that consensus wasn't " +
        "reached. Speak last-word style: address the strongest opposing arguments head-on and " +
        "commit to a final position.",
    );
  }

  const userParts: string[] = [`QUESTION FOR DELIBERATION:\n${session.question}`];
  if (session.context) userParts.push(`BACKGROUND CONTEXT:\n${session.context}`);
  if (evidence) userParts.push(evidenceBlock(evidence.brief, evidence.sources));
  if (visibleHistory.length > 0) {
    userParts.push(`TRANSCRIPT SO FAR:\n${formatTranscript(visibleHistory)}`);
  }

  return [
    { role: "system" as const, content: systemParts.join("\n\n") },
    { role: "user" as const, content: userParts.join("\n\n---\n\n") },
  ];
}

function formatTranscript(turns: Turn[]): string {
  return turns
    .map((t) => {
      const phaseLabel =
        t.phase === "opening" ? "Opening" : t.phase === "critique" ? `Round ${t.roundNumber}` : t.phase;
      return `[${phaseLabel}] ${t.speakerName}:\n${t.content}`;
    })
    .join("\n\n");
}

/** Best-effort extraction of turn references ("as X said in round 1"). */
function extractReferences(text: string, history: Turn[]): string[] {
  const refs = new Set<string>();
  const lower = text.toLowerCase();
  for (const turn of history) {
    if (lower.includes(turn.speakerName.toLowerCase())) refs.add(turn.id);
  }
  return [...refs];
}
