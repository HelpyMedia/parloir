/**
 * Core types for the parloir orchestrator.
 *
 * The debate protocol is a finite state machine over phases. Each phase
 * produces turns (either agent speech or human interjection). Turns are
 * streamed to the UI as they're produced; the full transcript is persisted
 * to Postgres for session history and decision-trail export.
 */

/** A phase in the debate protocol. Transitions are deterministic. */
export type Phase =
  | "setup" // Session configured, not yet running
  | "opening" // Phase 1: independent parallel statements (blind)
  | "critique" // Phase 2+: sequential critique with full visibility
  | "consensus_check" // Phase 3: judge evaluates convergence
  | "adaptive_round" // Phase 4: optional — judge-ranked reordered round
  | "synthesis" // Phase 5: secretary produces deliverable
  | "completed"
  | "paused" // Human-in-the-loop pause
  | "failed"
  | "quota_exhausted" // Hosted: out of credits mid-run; terminal for cloud
  | "estimator_error" // Hosted: reservation estimator could not run; terminal for cloud
  | "aborted"; // Hosted: workflow aborted by an authorized actor

/** Who produced a turn. */
export type SpeakerRole = "agent" | "human" | "judge" | "secretary";

/** A single message in the transcript. */
export interface Turn {
  id: string;
  sessionId: string;
  phase: Phase;
  roundNumber: number;
  turnIndex: number;
  speakerRole: SpeakerRole;
  /** Persona ID if agent/secretary/judge; user ID if human. */
  speakerId: string;
  speakerName: string;
  content: string;
  /** Tool calls made during this turn, if any. */
  toolCalls?: ToolCall[];
  /** Which previous turns this turn references (for "critique Agent X on turn Y"). */
  references?: string[];
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
  createdAt: Date;
}

export interface ToolCall {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  result: unknown;
  durationMs: number;
}

/** A queued human note waiting to be appended at the next phase boundary. */
export interface HumanInjection {
  id: string;
  sessionId: string;
  content: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
}

/** A persona template — reusable across sessions. */
export interface Persona {
  id: string;
  name: string;
  role: string; // e.g. "Devil's Advocate", "Financial Analyst"
  systemPrompt: string;
  /** Model ID. Format: "provider/model" e.g. "anthropic/claude-opus-4.6" */
  model: string;
  temperature: number;
  /** Tool IDs this persona can use. */
  toolIds: string[];
  /** Optional RAG sources this persona draws from. */
  ragSourceIds: string[];
  tags: string[];
  ownerId: string | null;
  visibility: "private" | "team" | "public";
}

/** Participant = a persona instance in a specific session. */
export interface Participant {
  sessionId: string;
  personaId: string;
  /** Stable seat order; used by round-robin speaker selection. */
  seatIndex: number;
  /** Silenced by the judge in the adaptive round. */
  silenced: boolean;
}

/**
 * Per-request provider credentials + local server URLs, loaded once per
 * debate run from the authenticated user's configured settings. Threaded
 * through the orchestrator so `resolveModel` can use the right keys.
 *
 * Hosted deployments may supply an optional `resolveModel` override. When
 * set, the orchestrator calls it instead of the default registry resolver.
 * The callback captures any per-attempt context it needs (billing middleware,
 * request metadata) in its closure; its only argument is the model id.
 */
export interface ProviderContext {
  cloud: Partial<Record<"openrouter" | "anthropic" | "openai" | "google", string>>;
  local: Partial<Record<"ollama" | "lmstudio", string>>;
  resolveModel?: (modelId: string) => import("ai").LanguageModel;
}

/** Protocol configuration — per session. */
export interface ProtocolConfig {
  /** Max number of critique rounds after the opening. Hard cap on cost. */
  maxCritiqueRounds: number;
  /** Consensus threshold [0, 1]. When judge emits >= this, stop critiquing. */
  consensusThreshold: number;
  /** Enable the adaptive (RA-CR) round when consensus is low. */
  enableAdaptiveRound: boolean;
  /** Hide agents' confidence scores in their output to prevent cascades. */
  hideConfidenceScores: boolean;
  /** Require each critique turn to bring something new (prevents sycophancy). */
  requireNovelty: boolean;
  /** Which model plays the judge. Cheap + fast recommended. */
  judgeModel: string;
  /** Which model plays the secretary (synthesis). Expensive + smart recommended. */
  synthesizerModel: string;
}

export const DEFAULT_PROTOCOL: ProtocolConfig = {
  maxCritiqueRounds: 2,
  consensusThreshold: 0.75,
  enableAdaptiveRound: true,
  hideConfidenceScores: true,
  requireNovelty: true,
  judgeModel: "anthropic/claude-haiku-4-5",
  synthesizerModel: "anthropic/claude-opus-4-7",
};

/** The session as a whole. */
export interface Session {
  id: string;
  title: string;
  /** The question / problem to deliberate on. */
  question: string;
  /** Optional context document(s) — RAG sources, user-provided briefs. */
  context: string;
  status: Phase;
  currentRound: number;
  protocol: ProtocolConfig;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  /** Set by POST /pause. Cleared by POST /resume. */
  pauseRequestedAt: Date | null;
  /** The phase the session was in when pause was requested — resume target. */
  pausedAtPhase: Phase | null;
  /**
   * Per-persona model override, keyed by personaId. Falls back to persona.model
   * if absent. Set by the session creator in the New Session form.
   */
  participantModelOverrides: Record<string, string>;
}

/** The judge's structured output after a consensus check. */
export interface ConsensusReport {
  consensusLevel: number; // [0, 1]
  agreeingParticipants: string[]; // persona IDs
  dissentingParticipants: string[];
  majorityPosition: string;
  minorityPositions: Array<{ position: string; holders: string[] }>;
  unresolvedQuestions: string[];
  /** RA-CR specific: rank participants by argument quality. */
  participantRanking: Array<{ personaId: string; score: number }>;
  /** RA-CR specific: who to silence in the next round (lowest-ranked). */
  silencedForNextRound: string[];
  /** Should we run another round, or proceed to synthesis? */
  recommendation: "another_round" | "proceed_to_synthesis" | "escalate_to_human";
  reasoning: string;
}

/** The secretary's final deliverable. */
export interface SynthesisArtifact {
  sessionId: string;
  decision: string;
  confidence: "high" | "medium" | "low";
  keyArguments: Array<{ position: string; proponents: string[] }>;
  tradeoffs: string[];
  minorityViews: Array<{ view: string; holders: string[] }>;
  unresolvedConcerns: string[];
  recommendedActions: string[];
  /** Full transcript markdown for export. */
  transcriptMarkdown: string;
  createdAt: Date;
}

/** Stream event emitted to the UI during a live session. */
export type StreamEvent =
  | { type: "phase_enter"; phase: Phase; round: number }
  | {
      type: "phase_exit";
      phase: Phase;
      round: number;
      reason: "normal" | "paused" | "error";
    }
  | { type: "turn_start"; speakerId: string; speakerName: string; phase: Phase }
  | { type: "turn_delta"; speakerId: string; textDelta: string }
  | { type: "turn_complete"; turn: Turn }
  | { type: "tool_call"; turnId: string; toolName: string; args: unknown }
  | { type: "tool_result"; turnId: string; toolName: string; result: unknown }
  | { type: "consensus_report"; report: ConsensusReport }
  | { type: "synthesis_complete"; artifact: SynthesisArtifact }
  | { type: "human_injection_request"; prompt: string }
  | { type: "error"; message: string; recoverable: boolean };
