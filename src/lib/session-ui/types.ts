import type {
  ConsensusReport,
  Phase,
  Persona,
  Session,
  SynthesisArtifact,
  ToolCall,
  Turn,
} from "@/lib/orchestrator/types";

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
  lastSeq: number;
  totalCostUsd: number;
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
}
