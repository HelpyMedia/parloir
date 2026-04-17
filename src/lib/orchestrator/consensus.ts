/**
 * Consensus judge. Reads the transcript and emits a structured
 * ConsensusReport via Vercel AI SDK's generateObject + Zod schema.
 *
 * This is a CHEAP model (Haiku or similar). Its job is narrow:
 * classify agreement/dissent, rank arguments, recommend next action.
 *
 * Resilience: callers pass a chain of candidate models; if every one
 * fails to produce structured output, we return a neutral stub report
 * so the debate proceeds to synthesis rather than crashing.
 *
 * Research note: keep the judge separate from the debaters. A debater
 * doubling as judge introduces bias toward its own position. Also, the
 * judge's output is structured — not free-form — to prevent it from
 * drifting into the debate itself.
 */

import { z } from "zod";
import { tryGenerateObject } from "./try-generate-object";
import type { Turn, Participant, ConsensusReport, ProviderContext } from "./types";

// Anthropic's structured-output validator rejects JSON Schema's minimum/maximum
// on number fields, so we can't use z.number().min(0).max(1) here. Describe the
// range in the field docs instead and clamp on the way out.
const ConsensusSchema = z.object({
  consensusLevel: z
    .number()
    .describe("Float between 0 and 1. 1 = full consensus, 0 = complete dissent."),
  agreeingParticipants: z.array(z.string()),
  dissentingParticipants: z.array(z.string()),
  majorityPosition: z.string(),
  minorityPositions: z.array(
    z.object({ position: z.string(), holders: z.array(z.string()) }),
  ),
  unresolvedQuestions: z.array(z.string()),
  participantRanking: z.array(
    z.object({
      personaId: z.string(),
      score: z.number().describe("Float between 0 and 1."),
    }),
  ),
  silencedForNextRound: z.array(z.string()),
  recommendation: z.enum(["another_round", "proceed_to_synthesis", "escalate_to_human"]),
  reasoning: z.string(),
});

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export async function evaluateConsensus(params: {
  question: string;
  transcript: Turn[];
  participants: Participant[];
  judgeModelChain: string[];
  ctx: ProviderContext;
}): Promise<ConsensusReport> {
  const { question, transcript, participants, judgeModelChain, ctx } = params;

  const participantList = participants
    .map((p) => `- ${p.personaId} (seat ${p.seatIndex})`)
    .join("\n");

  const transcriptText = transcript
    .map(
      (t) =>
        `[${t.phase} R${t.roundNumber}] ${t.speakerName} (${t.speakerId}):\n${t.content}`,
    )
    .join("\n\n");

  const result = await tryGenerateObject({
    modelChain: judgeModelChain,
    ctx,
    schema: ConsensusSchema,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an impartial deliberation moderator. You read the transcript of a multi-agent " +
          "debate and produce a structured consensus report. You are NOT a debater — do not " +
          "add your own opinion. You classify what others have said. Be rigorous about " +
          "identifying REAL agreement (people reaching the same substantive conclusion for " +
          "compatible reasons) vs. SURFACE agreement (people saying similar words but meaning " +
          "different things). Rank participants by argument quality: specificity, evidence, " +
          "responsiveness to others' points. The lowest-ranked participant will be silenced " +
          "in the next round, so be careful and defensible.",
      },
      {
        role: "user",
        content: [
          `DELIBERATION QUESTION:\n${question}`,
          `PARTICIPANTS:\n${participantList}`,
          `TRANSCRIPT:\n${transcriptText}`,
          "Produce the ConsensusReport now. Use persona IDs (not names) in all ID fields.",
        ].join("\n\n---\n\n"),
      },
    ],
  });

  if (!result) {
    return {
      consensusLevel: 0.5,
      agreeingParticipants: [],
      dissentingParticipants: [],
      majorityPosition:
        "Judge model failed to produce a structured consensus report; proceeding without ranking.",
      minorityPositions: [],
      unresolvedQuestions: [],
      participantRanking: participants.map((p) => ({
        personaId: p.personaId,
        score: 0.5,
      })),
      silencedForNextRound: [],
      recommendation: "proceed_to_synthesis",
      reasoning:
        "Fallback: the consensus judge could not produce structured output with any configured model. The debate continues to synthesis on the available transcript.",
    };
  }

  return {
    ...result.object,
    consensusLevel: clamp01(result.object.consensusLevel),
    participantRanking: result.object.participantRanking.map((r) => ({
      ...r,
      score: clamp01(r.score),
    })),
  };
}
