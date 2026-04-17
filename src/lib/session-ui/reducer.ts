import type { StreamEvent } from "@/lib/orchestrator/types";
import type { HydrationBundle, PersonaStatus, UIPersonaState, UISession } from "./types";

export function initialState(bundle: HydrationBundle): UISession {
  const personaState: Record<string, UIPersonaState> = {};
  for (const id of bundle.participantOrder) {
    personaState[id] = {
      personaId: id,
      status: bundle.synthesis ? "synthesizing" : "waiting",
      stance: null,
      confidence: null,
      silenced: false,
    };
  }
  applySilencingFrom(bundle.latestConsensus, personaState);

  return {
    sessionId: bundle.session.id,
    session: bundle.session,
    personas: bundle.personas,
    participantOrder: bundle.participantOrder,
    phase: bundle.session.status,
    round: bundle.session.currentRound,
    turns: bundle.turns,
    live: null,
    personaState,
    consensusReports: bundle.allConsensus,
    synthesis: bundle.synthesis,
    humanInjectionPrompt: null,
    error: null,
    lastSeq: bundle.lastSeq,
    totalCostUsd: bundle.turns.reduce((acc, t) => acc + t.costUsd, 0),
  };
}

export function applyEvent(state: UISession, event: StreamEvent): UISession {
  switch (event.type) {
    case "phase_enter": {
      const personaState = resetStatuses(state.personaState, event.phase);
      const humanInjectionPrompt =
        event.phase === "paused" ? state.humanInjectionPrompt : null;
      return {
        ...state,
        phase: event.phase,
        round: event.round,
        personaState,
        humanInjectionPrompt,
      };
    }

    case "turn_start": {
      const personaState = updatePersona(state.personaState, event.speakerId, {
        status: "speaking",
      });
      return {
        ...state,
        personaState,
        live: {
          speakerId: event.speakerId,
          speakerName: event.speakerName,
          phase: event.phase,
          text: "",
          toolCalls: [],
        },
      };
    }

    case "turn_delta": {
      if (!state.live || state.live.speakerId !== event.speakerId) return state;
      return {
        ...state,
        live: { ...state.live, text: state.live.text + event.textDelta },
      };
    }

    case "turn_complete": {
      const personaState = updatePersona(state.personaState, event.turn.speakerId, {
        status: "listening",
      });
      return {
        ...state,
        turns: [...state.turns, event.turn],
        live: null,
        personaState,
        totalCostUsd: state.totalCostUsd + event.turn.costUsd,
      };
    }

    case "tool_call": {
      if (!state.live) return state;
      const speakerId = state.live.speakerId;
      const personaState = updatePersona(state.personaState, speakerId, {
        status: "researching",
      });
      return {
        ...state,
        personaState,
        live: {
          ...state.live,
          toolCalls: [
            ...state.live.toolCalls,
            {
              id: event.turnId,
              toolName: event.toolName,
              args: (event.args as Record<string, unknown>) ?? {},
              result: null,
              durationMs: 0,
            },
          ],
        },
      };
    }

    case "tool_result": {
      if (!state.live) return state;
      const speakerId = state.live.speakerId;
      const personaState = updatePersona(state.personaState, speakerId, {
        status: "speaking",
      });
      const toolCalls = state.live.toolCalls.map((tc) =>
        tc.toolName === event.toolName && tc.result === null
          ? { ...tc, result: event.result }
          : tc,
      );
      return { ...state, personaState, live: { ...state.live, toolCalls } };
    }

    case "consensus_report": {
      const personaState = { ...state.personaState };
      applySilencingFrom(event.report, personaState);
      return {
        ...state,
        personaState,
        consensusReports: [...state.consensusReports, event.report],
      };
    }

    case "synthesis_complete":
      return {
        ...state,
        synthesis: event.artifact,
        phase: "completed",
        live: null,
      };

    case "human_injection_request":
      return { ...state, humanInjectionPrompt: event.prompt, phase: "paused" };

    case "error":
      return { ...state, error: event.message };
  }
}

function updatePersona(
  state: Record<string, UIPersonaState>,
  personaId: string,
  patch: Partial<UIPersonaState>,
): Record<string, UIPersonaState> {
  const current = state[personaId];
  if (!current) return state;
  return { ...state, [personaId]: { ...current, ...patch } };
}

function resetStatuses(
  state: Record<string, UIPersonaState>,
  phase: string,
): Record<string, UIPersonaState> {
  const next: Record<string, UIPersonaState> = {};
  const defaultStatus: PersonaStatus = phase === "synthesis" ? "synthesizing" : "listening";
  for (const [id, p] of Object.entries(state)) {
    next[id] = { ...p, status: p.silenced ? "silenced" : defaultStatus };
  }
  return next;
}

function applySilencingFrom(
  report: { silencedForNextRound?: string[] } | null | undefined,
  state: Record<string, UIPersonaState>,
): void {
  if (!report) return;
  const silenced = new Set(report.silencedForNextRound ?? []);
  for (const [id, p] of Object.entries(state)) {
    state[id] = { ...p, silenced: silenced.has(id), status: silenced.has(id) ? "silenced" : p.status };
  }
}
