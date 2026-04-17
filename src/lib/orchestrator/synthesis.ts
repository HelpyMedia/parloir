/**
 * Synthesis agent — the "secretary".
 *
 * Reads the full transcript and produces the decision-grade deliverable:
 * the actual thing the user exports. This is the output that makes the
 * tool worth using.
 *
 * Uses an EXPENSIVE model (Opus or similar) — one call, high quality.
 * The cost is justified because every other phase used cheaper models
 * and this is what the user actually keeps.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/providers/registry";
import type { Session, Turn, SynthesisArtifact, ProviderContext } from "./types";
import type { StreamSink } from "./protocol";

const SynthesisSchema = z.object({
  decision: z.string().describe("The recommended decision or answer in 2-4 sentences."),
  confidence: z.enum(["high", "medium", "low"]),
  keyArguments: z.array(
    z.object({
      position: z.string(),
      proponents: z.array(z.string()),
    }),
  ),
  tradeoffs: z.array(z.string()),
  minorityViews: z.array(
    z.object({
      view: z.string(),
      holders: z.array(z.string()),
    }),
  ),
  unresolvedConcerns: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});

export async function synthesize(params: {
  session: Session;
  transcript: Turn[];
  synthesizerModel: string;
  sink: StreamSink;
}): Promise<SynthesisArtifact> {
  const { session, transcript, synthesizerModel } = params;

  const transcriptText = transcript
    .map(
      (t) => `[${t.phase} R${t.roundNumber}] ${t.speakerName}:\n${t.content}`,
    )
    .join("\n\n");

  // TODO(Task 10): pass real ProviderContext from worker
  const result = await generateObject({
    model: resolveModel(synthesizerModel, {} as ProviderContext),
    schema: SynthesisSchema,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "You are the secretary of a deliberation panel. You read the full transcript and " +
          "produce a decision-grade summary. Your output is what the user will export and use. " +
          "Be concrete. Be honest about dissent — if the panel didn't agree, say so. Do not " +
          "paper over real disagreement. Confidence levels: HIGH = strong cross-agent consensus " +
          "with specific evidence; MEDIUM = rough consensus with some open questions; LOW = " +
          "genuine unresolved disagreement, decision is a judgment call.",
      },
      {
        role: "user",
        content: [
          `ORIGINAL QUESTION:\n${session.question}`,
          session.context ? `CONTEXT:\n${session.context}` : "",
          `FULL TRANSCRIPT:\n${transcriptText}`,
          "Produce the synthesis artifact now.",
        ]
          .filter(Boolean)
          .join("\n\n---\n\n"),
      },
    ],
  });

  return {
    sessionId: session.id,
    ...result.object,
    transcriptMarkdown: renderTranscriptMarkdown(session, transcript, result.object),
    createdAt: new Date(),
  };
}

function renderTranscriptMarkdown(
  session: Session,
  transcript: Turn[],
  synthesis: z.infer<typeof SynthesisSchema>,
): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`**Question:** ${session.question}`);
  lines.push("");
  lines.push("## Decision");
  lines.push(synthesis.decision);
  lines.push("");
  lines.push(`**Confidence:** ${synthesis.confidence}`);
  lines.push("");
  lines.push("## Key arguments");
  for (const arg of synthesis.keyArguments) {
    lines.push(`- **${arg.position}** — ${arg.proponents.join(", ")}`);
  }
  lines.push("");
  lines.push("## Tradeoffs");
  for (const t of synthesis.tradeoffs) lines.push(`- ${t}`);
  lines.push("");
  if (synthesis.minorityViews.length) {
    lines.push("## Minority views");
    for (const mv of synthesis.minorityViews) {
      lines.push(`- **${mv.view}** — ${mv.holders.join(", ")}`);
    }
    lines.push("");
  }
  if (synthesis.unresolvedConcerns.length) {
    lines.push("## Unresolved concerns");
    for (const c of synthesis.unresolvedConcerns) lines.push(`- ${c}`);
    lines.push("");
  }
  lines.push("## Recommended actions");
  for (const a of synthesis.recommendedActions) lines.push(`- ${a}`);
  lines.push("");
  lines.push("---");
  lines.push("## Full transcript");
  lines.push("");
  for (const turn of transcript) {
    lines.push(`### ${turn.speakerName} — ${turn.phase} (round ${turn.roundNumber})`);
    lines.push("");
    lines.push(turn.content);
    lines.push("");
  }
  return lines.join("\n");
}
