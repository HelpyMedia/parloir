import type {
  ConsensusReport,
  Phase,
  Persona,
  Session,
  SynthesisArtifact,
  ToolCall,
  Turn, ModelFixSeat } from "@/lib/orchestrator/types";

export type PersonaStatus =
  | "listening"
  | "speaking"
  | "researching"
  | "revising"
  | "challenging"
  | "waiting"
  | "synthesizing"
  | "silenced";

export interface UIPersonaState {
  personaId: string;
  status: PersonaStatus;
  stance: string | null;
  confidence: "low" | "medium" | "high" | null;
  silenced: boolean;
}

export interface LiveTurn {
  speakerId: string;
  speakerName: string;
  phase: Phase;
  text: string;
  toolCalls: ToolCall[];
}

export interface UISession {
  sessionId: string;
  session: Session;
  personas: Persona[];
  participantOrder: string[];
  phase: Phase;
  round: number;
  turns: Turn[];
  live: LiveTurn | null;
  personaState: Record<string, UIPersonaState>;
  consensusReports: ConsensusReport[];
  synthesis: SynthesisArtifact | null;
  humanInjectionPrompt: string | null;
  error: string | null;
  /** Machine-readable reason when the session failed (see model-errors.ts). */
  errorCode: string | null;
  /** Non-fatal problems, e.g. a panelist whose model failed and was skipped. */
  notices: TurnNotice[];
  /** Panelists whose model failed, for the failure dialog and "Try again". */
  failedSeats: FailedSeat[];
  /** Set while the debate is paused waiting for failed models to be fixed. */
  modelFix: ModelFixSeat[] | null;
  /** Panelists the person took off the panel. */
  removedIds: string[];
  lastSeq: number;
  totalCostUsd: number;
}

/** A panelist whose model failed and hasn't answered since. */
export interface FailedSeat {
  personaId: string;
  personaName: string;
  modelId: string;
  /** Error code from model-errors.ts. */
  code: string;
}

export interface TurnNotice {
  seqKey: string;
  speakerId: string;
  speakerName: string;
  code: string;
  message: string;
}

export interface HydrationBundle {
  session: Session;
  personas: Persona[];
  participantOrder: string[];
  turns: Turn[];
  latestConsensus: ConsensusReport | null;
  allConsensus: ConsensusReport[];
  synthesis: SynthesisArtifact | null;
  lastSeq: number;
  /** Set when the session ended in failure, from its last error event. */
  failure: { message: string; code: string | null } | null;
  /** Panelists whose model failed (only loaded for failed sessions). */
  failedSeats: FailedSeat[];
  /** Pending model fix when the session is paused for one. */
  modelFix: ModelFixSeat[] | null;
  removedPersonaIds: string[];
}
