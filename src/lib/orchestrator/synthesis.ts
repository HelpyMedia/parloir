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
 *
 * Resilience: callers pass a chain of candidate models. We first try
 * structured generateObject through the chain. If every candidate fails
 * (small local models often can't produce valid JSON against nested
 * schemas), we last-ditch with plain-text generateText and wrap the
 * prose in a minimal artifact so the user still gets an export.
 */

import { generateText, type ModelMessage } from "ai";
import { z } from "zod";
import { resolveModel } from "@/lib/providers/registry";
import { tryGenerateObject } from "./try-generate-object";
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
  synthesizerModelChain: string[];
  ctx: ProviderContext;
  sink: StreamSink;
}): Promise<SynthesisArtifact> {
  const { session, transcript, synthesizerModelChain, ctx } = params;

  const transcriptText = transcript
    .map(
      (t) => `[${t.phase} R${t.roundNumber}] ${t.speakerName}:\n${t.content}`,
    )
    .join("\n\n");

  const messages: ModelMessage[] = [
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
  ];

  const structured = await tryGenerateObject({
    modelChain: synthesizerModelChain,
    ctx,
    schema: SynthesisSchema,
    temperature: 0.3,
    messages,
  });

  if (structured) {
    return {
      sessionId: session.id,
      ...structured.object,
      transcriptMarkdown: renderTranscriptMarkdown(
        session,
        transcript,
        structured.object,
      ),
      createdAt: new Date(),
    };
  }

  for (const modelId of synthesizerModelChain) {
    try {
      const { text } = await generateText({
        model: resolveModel(modelId, ctx),
        temperature: 0.3,
        messages,
      });
      return {
        sessionId: session.id,
        decision: text.slice(0, 500),
        confidence: "low",
        keyArguments: [],
        tradeoffs: [],
        minorityViews: [],
        unresolvedConcerns: [
          `Structured synthesis failed; this is a prose-only fallback from ${modelId}.`,
        ],
        recommendedActions: [],
        transcriptMarkdown:
          text + "\n\n---\n\n" + renderTranscriptOnly(session, transcript),
        createdAt: new Date(),
      };
    } catch (e) {
      console.warn(`synthesize: generateText fallback failed on ${modelId}`, e);
    }
  }

  throw new Error(
    "Synthesis failed: every configured model could not produce either a structured or a prose deliverable. Connect a capable cloud provider at /settings.",
  );
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
  lines.push(renderTranscriptOnly(session, transcript));
  return lines.join("\n");
}

function renderTranscriptOnly(session: Session, transcript: Turn[]): string {
  const lines: string[] = [];
  lines.push(`## Full transcript — ${session.title}`);
  lines.push("");
  for (const turn of transcript) {
    lines.push(`### ${turn.speakerName} — ${turn.phase} (round ${turn.roundNumber})`);
    lines.push("");
    lines.push(turn.content);
    lines.push("");
  }
  return lines.join("\n");
}
