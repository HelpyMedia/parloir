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
import { resolveModel } from "../providers/registry";
import { attemptSignal, tryGenerateObject } from "./try-generate-object";

/** Whole synthesis (structured chain + prose fallback) must fit in one step. */
const SYNTHESIS_BUDGET_MS = 250_000;
import type { Session, Turn, SynthesisArtifact, ProviderContext, SessionSource } from "./types";
import type { StreamSink } from "./protocol";
import { citedIds, evidenceBlock, formatSourceList, sanitizeCitations } from "../research/sources";

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

type SynthesisFields = z.infer<typeof SynthesisSchema>;

export async function synthesize(params: {
  session: Session;
  transcript: Turn[];
  /** The research brief, when the research phase ran. */
  brief: string | null;
  /** The session's source registry: the only pages the deliverable may cite. */
  sources: SessionSource[];
  synthesizerModelChain: string[];
  ctx: ProviderContext;
  sink: StreamSink;
}): Promise<SynthesisArtifact> {
  const { session, transcript, brief, sources, synthesizerModelChain, ctx } = params;
  const deadline = Date.now() + SYNTHESIS_BUDGET_MS;

  const transcriptText = transcript
    .filter((t) => t.phase !== "research")
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
        "genuine unresolved disagreement, decision is a judgment call. Write every text field " +
        "in the same language as the ORIGINAL QUESTION. Refer to panelists by their names." +
        (sources.length > 0
          ? " Where a statement rests on web evidence, cite it with the [S#] IDs from the SOURCES " +
            "list, exactly as the panel did. Cite only those IDs, never write URLs, never invent sources."
          : " Do not write URLs or cite sources."),
    },
    {
      role: "user",
      content: [
        `ORIGINAL QUESTION:\n${session.question}`,
        session.context ? `CONTEXT:\n${session.context}` : "",
        brief
          ? evidenceBlock(brief, sources)
          : sources.length > 0
            ? `SOURCES (found by the panel's web searches):\n${formatSourceList(sources)}`
            : "",
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
    attemptKind: "synthesis",
    effort: "medium",
    // Leave room for the prose fallback below.
    deadline: deadline - 60_000,
  });

  if (structured) {
    const fields = sanitizeFields(structured.object, sources);
    const cited = citedSources(allText(fields), sources);
    return {
      sessionId: session.id,
      ...fields,
      sources: cited,
      transcriptMarkdown: renderTranscriptMarkdown(session, transcript, fields, cited),
      createdAt: new Date(),
    };
  }

  for (const modelId of synthesizerModelChain) {
    const signal = attemptSignal(deadline);
    if (!signal) break;
    try {
      const { text } = await generateText({
        model: ctx.resolveModel
          ? ctx.resolveModel(modelId)
          : resolveModel(modelId, ctx),
        temperature: 0.3,
        messages,
        maxRetries: 1,
        abortSignal: signal,
        providerOptions: { openrouter: { usage: { include: true } } },
      });
      if (!text.trim()) continue;
      const clean = sanitizeCitations(text, sources);
      const cited = citedSources(clean, sources);
      return {
        sessionId: session.id,
        decision: clean.slice(0, 500),
        confidence: "low",
        keyArguments: [],
        tradeoffs: [],
        minorityViews: [],
        unresolvedConcerns: [],
        recommendedActions: [],
        sources: cited,
        transcriptMarkdown: [clean, renderSources(session, cited), "---", renderTranscriptOnly(session, transcript)]
          .filter(Boolean)
          .join("\n\n"),
        createdAt: new Date(),
      };
    } catch (e) {
      console.warn(`synthesize: generateText fallback failed on ${modelId}`, e);
    }
  }

  throw new Error(
    "None of the panel's models could write the final summary. Try again with a stronger secretary model.",
  );
}

/**
 * Models invent citations. Every text field keeps only [S#] IDs the
 * registry holds and URLs that are registered pages.
 */
function sanitizeFields(f: SynthesisFields, sources: SessionSource[]): SynthesisFields {
  const clean = (text: string) => sanitizeCitations(text, sources);
  return {
    ...f,
    decision: clean(f.decision),
    keyArguments: f.keyArguments.map((a) => ({ ...a, position: clean(a.position) })),
    tradeoffs: f.tradeoffs.map(clean),
    minorityViews: f.minorityViews.map((v) => ({ ...v, view: clean(v.view) })),
    unresolvedConcerns: f.unresolvedConcerns.map(clean),
    recommendedActions: f.recommendedActions.map(clean),
  };
}

function allText(f: SynthesisFields): string {
  return [
    f.decision,
    ...f.keyArguments.map((a) => a.position),
    ...f.tradeoffs,
    ...f.minorityViews.map((v) => v.view),
    ...f.unresolvedConcerns,
    ...f.recommendedActions,
  ].join("\n");
}

/** Registered sources the text cites, in registry order. */
function citedSources(text: string, sources: SessionSource[]): Array<{ id: string; url: string; title: string }> {
  const cited = new Set(citedIds(text));
  return sources.filter((s) => cited.has(s.id)).map(({ id, url, title }) => ({ id, url, title }));
}

/** Built from the registry, never from model output. */
function renderSources(session: Session, cited: Array<{ id: string; url: string; title: string }>): string {
  if (cited.length === 0) return "";
  const h = headingsFor(session);
  return [`## ${h.sources}`, ...cited.map((s) => `- [${s.id}] [${escapeLinkText(s.title || s.url)}](<${s.url}>)`)].join(
    "\n",
  );
}

function escapeLinkText(text: string): string {
  return text.replace(/([[\]])/g, "\\$1");
}

const HEADINGS = {
  en: {
    question: "Question",
    decision: "Decision",
    confidence: "Confidence",
    keyArguments: "Key arguments",
    tradeoffs: "Tradeoffs",
    minority: "Minority views",
    unresolved: "Unresolved concerns",
    actions: "Recommended actions",
    sources: "Sources",
    transcript: "Full transcript",
    round: "round",
    levels: { high: "high", medium: "medium", low: "low" },
  },
  fr: {
    question: "Question",
    decision: "Décision",
    confidence: "Niveau de confiance",
    keyArguments: "Arguments clés",
    tradeoffs: "Compromis",
    minority: "Points de vue minoritaires",
    unresolved: "Préoccupations non résolues",
    actions: "Actions recommandées",
    sources: "Sources",
    transcript: "Transcription complète",
    round: "ronde",
    levels: { high: "élevé", medium: "moyen", low: "faible" },
  },
} as const;

const PHASE_LABELS: Record<"en" | "fr", Record<string, string>> = {
  en: { research: "web research", opening: "opening", critique: "critique", adaptive_round: "final round", consensus_check: "consensus check", synthesis: "synthesis" },
  fr: { research: "recherche web", opening: "ouverture", critique: "critique", adaptive_round: "ronde finale", consensus_check: "vérification du consensus", synthesis: "synthèse" },
};

function headingsFor(session: Session) {
  return HEADINGS[session.protocol.locale === "fr" ? "fr" : "en"];
}

/** French typography puts a space before the colon. */
function colon(session: Session) {
  return session.protocol.locale === "fr" ? "\u00a0:" : ":";
}

function renderTranscriptMarkdown(
  session: Session,
  transcript: Turn[],
  synthesis: SynthesisFields,
  cited: Array<{ id: string; url: string; title: string }>,
): string {
  const h = headingsFor(session);
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push("");
  lines.push(`**${h.question}${colon(session)}** ${session.question}`);
  lines.push("");
  lines.push(`## ${h.decision}`);
  lines.push(synthesis.decision);
  lines.push("");
  lines.push(`**${h.confidence}${colon(session)}** ${h.levels[synthesis.confidence]}`);
  lines.push("");
  lines.push(`## ${h.keyArguments}`);
  for (const arg of synthesis.keyArguments) {
    lines.push(`- **${arg.position}** — ${arg.proponents.join(", ")}`);
  }
  lines.push("");
  lines.push(`## ${h.tradeoffs}`);
  for (const t of synthesis.tradeoffs) lines.push(`- ${t}`);
  lines.push("");
  if (synthesis.minorityViews.length) {
    lines.push(`## ${h.minority}`);
    for (const mv of synthesis.minorityViews) {
      lines.push(`- **${mv.view}** — ${mv.holders.join(", ")}`);
    }
    lines.push("");
  }
  if (synthesis.unresolvedConcerns.length) {
    lines.push(`## ${h.unresolved}`);
    for (const c of synthesis.unresolvedConcerns) lines.push(`- ${c}`);
    lines.push("");
  }
  lines.push(`## ${h.actions}`);
  for (const a of synthesis.recommendedActions) lines.push(`- ${a}`);
  lines.push("");
  const sourcesSection = renderSources(session, cited);
  if (sourcesSection) {
    lines.push(sourcesSection);
    lines.push("");
  }
  lines.push("---");
  lines.push(renderTranscriptOnly(session, transcript));
  return lines.join("\n");
}

function renderTranscriptOnly(session: Session, transcript: Turn[]): string {
  const h = headingsFor(session);
  const phases = PHASE_LABELS[session.protocol.locale === "fr" ? "fr" : "en"];
  const lines: string[] = [];
  lines.push(`## ${h.transcript} — ${session.title}`);
  lines.push("");
  for (const turn of transcript) {
    const phase = phases[turn.phase] ?? turn.phase;
    lines.push(
      turn.phase === "research"
        ? `### ${turn.speakerName} — ${phase}`
        : `### ${turn.speakerName} — ${phase} (${h.round} ${turn.roundNumber})`,
    );
    lines.push("");
    lines.push(turn.content);
    lines.push("");
  }
  return lines.join("\n");
}
