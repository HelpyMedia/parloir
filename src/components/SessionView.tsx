"use client";

/**
 * SessionView — the live debate UI.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Header: title, question, phase indicator, cost meter        │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Participant seats row (2-5 persona cards, live status)      │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Transcript stream (turns + phase dividers + consensus cards)│
 *   │   (scrolls, auto-follows tail unless user scrolls up)       │
 *   │                                                             │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │ Footer: pause button, interject input, export               │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * The visual metaphor is a Slack channel — not a Zoom grid — because
 * people read debates linearly, not spatially.
 */

import { useEffect, useReducer, useRef } from "react";
import type {
  Persona,
  Session,
  StreamEvent,
  Turn,
  ConsensusReport,
  SynthesisArtifact,
  Phase,
} from "@/lib/orchestrator/types";

interface Props {
  session: Session;
  personas: Persona[]; // participants, in seat order
  initialTurns: Turn[];
  initialLastSeq: number;
}

type UIState = {
  turns: Turn[];
  activeSpeakerId: string | null;
  liveDeltas: Record<string, string>; // partial content while streaming
  phase: Phase;
  round: number;
  consensusReports: ConsensusReport[];
  synthesis: SynthesisArtifact | null;
  totalCostUsd: number;
  lastSeq: number;
  error: string | null;
};

type UIAction =
  | { type: "phase_enter"; phase: Phase; round: number }
  | { type: "turn_start"; speakerId: string }
  | { type: "turn_delta"; speakerId: string; textDelta: string }
  | { type: "turn_complete"; turn: Turn }
  | { type: "consensus_report"; report: ConsensusReport }
  | { type: "synthesis_complete"; artifact: SynthesisArtifact }
  | { type: "error"; message: string }
  | { type: "seq"; seq: number };

function reducer(s: UIState, a: UIAction): UIState {
  switch (a.type) {
    case "phase_enter":
      return { ...s, phase: a.phase, round: a.round };
    case "turn_start":
      return {
        ...s,
        activeSpeakerId: a.speakerId,
        liveDeltas: { ...s.liveDeltas, [a.speakerId]: "" },
      };
    case "turn_delta":
      return {
        ...s,
        liveDeltas: {
          ...s.liveDeltas,
          [a.speakerId]: (s.liveDeltas[a.speakerId] ?? "") + a.textDelta,
        },
      };
    case "turn_complete": {
      const { [a.turn.speakerId]: _, ...restDeltas } = s.liveDeltas;
      return {
        ...s,
        turns: [...s.turns, a.turn],
        liveDeltas: restDeltas,
        activeSpeakerId: null,
        totalCostUsd: s.totalCostUsd + a.turn.costUsd,
      };
    }
    case "consensus_report":
      return { ...s, consensusReports: [...s.consensusReports, a.report] };
    case "synthesis_complete":
      return { ...s, synthesis: a.artifact, phase: "completed" };
    case "error":
      return { ...s, error: a.message };
    case "seq":
      return { ...s, lastSeq: a.seq };
  }
}

export function SessionView({ session, personas, initialTurns, initialLastSeq }: Props) {
  const [state, dispatch] = useReducer(reducer, {
    turns: initialTurns,
    activeSpeakerId: null,
    liveDeltas: {},
    phase: session.status,
    round: session.currentRound,
    consensusReports: [],
    synthesis: null,
    totalCostUsd: initialTurns.reduce((acc, t) => acc + t.costUsd, 0),
    lastSeq: initialLastSeq,
    error: null,
  });

  const transcriptRef = useRef<HTMLDivElement>(null);
  const autoFollowRef = useRef(true);

  // Subscribe to SSE updates.
  useEffect(() => {
    if (state.phase === "completed" || state.phase === "failed") return;

    const url = `/api/sessions/${session.id}/stream?lastSeq=${state.lastSeq}`;
    const source = new EventSource(url);

    source.addEventListener("turn", (e) => {
      const msg = JSON.parse((e as MessageEvent).data) as {
        seq: number;
        event: StreamEvent;
      };
      dispatch({ type: "seq", seq: msg.seq });
      applyEvent(msg.event, dispatch);
    });

    source.addEventListener("error", (e) => {
      const msg = (e as MessageEvent).data;
      if (msg) {
        const parsed = JSON.parse(msg);
        dispatch({ type: "error", message: parsed.message });
      }
      // EventSource auto-reconnects with the lastSeq we set.
    });

    source.addEventListener("done", () => {
      source.close();
    });

    return () => source.close();
    // Intentionally narrow deps — we don't want to re-open on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id, state.phase]);

  // Auto-follow transcript tail unless user scrolled up.
  useEffect(() => {
    if (!autoFollowRef.current || !transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [state.turns.length, state.liveDeltas]);

  return (
    <div className="flex h-screen flex-col">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-medium">{session.title}</h1>
            <p className="mt-1 truncate text-sm text-neutral-600">{session.question}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-xs text-neutral-500">
            <PhaseBadge phase={state.phase} round={state.round} />
            <span>${state.totalCostUsd.toFixed(3)}</span>
          </div>
        </div>
      </header>

      {/* Participant seats */}
      <section className="border-b px-6 py-3">
        <div className="flex gap-3 overflow-x-auto">
          {personas.map((persona) => (
            <PersonaSeat
              key={persona.id}
              persona={persona}
              isActive={state.activeSpeakerId === persona.id}
              isSilenced={state.consensusReports.at(-1)?.silencedForNextRound.includes(persona.id) ?? false}
            />
          ))}
        </div>
      </section>

      {/* Transcript */}
      <main
        ref={transcriptRef}
        className="flex-1 overflow-y-auto px-6 py-4"
        onScroll={(e) => {
          const el = e.currentTarget;
          autoFollowRef.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        <TranscriptStream
          turns={state.turns}
          liveDeltas={state.liveDeltas}
          activeSpeakerId={state.activeSpeakerId}
          consensusReports={state.consensusReports}
          personas={personas}
        />

        {state.synthesis && <SynthesisCard artifact={state.synthesis} />}
        {state.error && <ErrorBanner message={state.error} />}
      </main>

      {/* Footer */}
      <footer className="border-t px-6 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
            disabled={state.phase === "completed"}
          >
            Pause
          </button>
          <input
            type="text"
            placeholder="Interject — your message will be inserted at the next turn boundary"
            className="flex-1 rounded-md border px-3 py-1.5 text-sm"
            disabled={state.phase === "completed"}
          />
          <button
            type="button"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
            disabled={!state.synthesis}
          >
            Export
          </button>
        </div>
      </footer>
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function PhaseBadge({ phase, round }: { phase: Phase; round: number }) {
  const label: Record<Phase, string> = {
    setup: "Setup",
    opening: "Opening",
    critique: `Round ${round}`,
    consensus_check: "Consensus check",
    adaptive_round: `Adaptive R${round}`,
    synthesis: "Synthesizing",
    completed: "Completed",
    paused: "Paused",
    failed: "Failed",
  };
  const tone: Record<Phase, string> = {
    setup: "bg-neutral-100 text-neutral-700",
    opening: "bg-purple-100 text-purple-900",
    critique: "bg-teal-100 text-teal-900",
    consensus_check: "bg-amber-100 text-amber-900",
    adaptive_round: "bg-coral-100 text-coral-900",
    synthesis: "bg-amber-200 text-amber-900",
    completed: "bg-green-100 text-green-900",
    paused: "bg-neutral-200 text-neutral-700",
    failed: "bg-red-100 text-red-900",
  };
  return (
    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone[phase]}`}>
      {label[phase]}
    </span>
  );
}

function PersonaSeat({
  persona,
  isActive,
  isSilenced,
}: {
  persona: Persona;
  isActive: boolean;
  isSilenced: boolean;
}) {
  return (
    <div
      className={`flex min-w-[180px] shrink-0 items-center gap-3 rounded-lg border p-3 ${
        isActive ? "border-purple-400 bg-purple-50" : "bg-white"
      } ${isSilenced ? "opacity-40" : ""}`}
    >
      <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-200 text-sm font-medium">
        {persona.name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{persona.name}</div>
        <div className="truncate text-xs text-neutral-500">{persona.role}</div>
      </div>
      {isActive && <span className="h-2 w-2 animate-pulse rounded-full bg-purple-500" />}
    </div>
  );
}

function TranscriptStream({
  turns,
  liveDeltas,
  activeSpeakerId,
  consensusReports,
  personas,
}: {
  turns: Turn[];
  liveDeltas: Record<string, string>;
  activeSpeakerId: string | null;
  consensusReports: ConsensusReport[];
  personas: Persona[];
}) {
  const personaById = new Map(personas.map((p) => [p.id, p]));

  // Interleave turns, phase dividers, and consensus reports by round.
  const elements: React.ReactNode[] = [];
  let currentPhase: Phase | null = null;

  for (const turn of turns) {
    if (turn.phase !== currentPhase) {
      elements.push(<PhaseDivider key={`pd-${turn.phase}-${turn.roundNumber}`} phase={turn.phase} round={turn.roundNumber} />);
      currentPhase = turn.phase;
    }
    elements.push(<TurnCard key={turn.id} turn={turn} persona={personaById.get(turn.speakerId)} />);

    // If a consensus report followed this round, drop it in.
    const report = consensusReports.find(
      (_r, i) => i === turn.roundNumber - 1,
    );
    // (actual placement would need round tracking — kept simple for scaffold)
    if (report && turn === turns[turns.length - 1]) {
      elements.push(<ConsensusCard key={`cr-${turn.roundNumber}`} report={report} />);
    }
  }

  // Live streaming turn (in-progress).
  if (activeSpeakerId && liveDeltas[activeSpeakerId]) {
    const persona = personaById.get(activeSpeakerId);
    elements.push(
      <div key="live" className="my-3 rounded-lg border border-purple-300 bg-white p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-sm font-medium">{persona?.name ?? activeSpeakerId}</span>
          <span className="text-xs text-neutral-500">{persona?.role ?? ""}</span>
          <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-purple-500" />
        </div>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {liveDeltas[activeSpeakerId]}
          <span className="inline-block h-4 w-[2px] animate-pulse bg-neutral-400 align-middle" />
        </div>
      </div>,
    );
  }

  return <div className="space-y-3">{elements}</div>;
}

function PhaseDivider({ phase, round }: { phase: Phase; round: number }) {
  const label =
    phase === "opening"
      ? "Opening statements"
      : phase === "critique"
        ? `Critique — round ${round}`
        : phase === "adaptive_round"
          ? `Adaptive round ${round}`
          : phase === "synthesis"
            ? "Synthesis"
            : phase;
  return (
    <div className="my-2 flex items-center gap-3 text-xs uppercase tracking-wide text-neutral-500">
      <span className="h-px flex-1 bg-neutral-200" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-neutral-200" />
    </div>
  );
}

function TurnCard({ turn, persona }: { turn: Turn; persona?: Persona }) {
  return (
    <article className="rounded-lg border bg-white p-4">
      <header className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{persona?.name ?? turn.speakerName}</span>
        <span className="text-xs text-neutral-500">{persona?.role ?? ""}</span>
        <span className="ml-auto text-xs text-neutral-400">
          {turn.tokensIn} in / {turn.tokensOut} out · ${turn.costUsd.toFixed(4)}
        </span>
      </header>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{turn.content}</div>
      {turn.toolCalls && turn.toolCalls.length > 0 && (
        <div className="mt-2 text-xs text-neutral-500">
          Used: {turn.toolCalls.map((tc) => tc.toolName).join(", ")}
        </div>
      )}
    </article>
  );
}

function ConsensusCard({ report }: { report: ConsensusReport }) {
  const pct = Math.round(report.consensusLevel * 100);
  return (
    <aside className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-amber-900">Consensus check</span>
        <span className="text-xs text-amber-800">{pct}% alignment</span>
      </div>
      <p className="text-sm text-amber-900">{report.majorityPosition}</p>
      {report.unresolvedQuestions.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-800">
          {report.unresolvedQuestions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ul>
      )}
    </aside>
  );
}

function SynthesisCard({ artifact }: { artifact: SynthesisArtifact }) {
  return (
    <aside className="mt-4 rounded-lg border-2 border-amber-400 bg-white p-5">
      <header className="mb-3 flex items-center gap-2">
        <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-medium text-white">
          Decision
        </span>
        <span className="text-xs text-neutral-500">
          Confidence: {artifact.confidence}
        </span>
      </header>
      <p className="text-base leading-relaxed">{artifact.decision}</p>
      {artifact.recommendedActions.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-medium">Recommended actions</h3>
          <ul className="mt-2 list-disc pl-5 text-sm">
            {artifact.recommendedActions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      {message}
    </div>
  );
}

// ─── Event → action bridge ──────────────────────────────────────────────────
function applyEvent(evt: StreamEvent, dispatch: (a: UIAction) => void) {
  switch (evt.type) {
    case "phase_enter":
      dispatch({ type: "phase_enter", phase: evt.phase, round: evt.round });
      return;
    case "turn_start":
      dispatch({ type: "turn_start", speakerId: evt.speakerId });
      return;
    case "turn_delta":
      dispatch({ type: "turn_delta", speakerId: evt.speakerId, textDelta: evt.textDelta });
      return;
    case "turn_complete":
      dispatch({ type: "turn_complete", turn: evt.turn });
      return;
    case "consensus_report":
      dispatch({ type: "consensus_report", report: evt.report });
      return;
    case "synthesis_complete":
      dispatch({ type: "synthesis_complete", artifact: evt.artifact });
      return;
    case "error":
      dispatch({ type: "error", message: evt.message });
      return;
  }
}
