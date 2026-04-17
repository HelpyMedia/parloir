/**
 * Drizzle schema. Postgres + pgvector for RAG embeddings.
 *
 * Design notes:
 * - Turns use JSONB for tool_calls and references — small nested arrays,
 *   queryable when needed, flexible for protocol changes.
 * - Protocol config lives on the session row so you can replay/branch a
 *   session with different settings later.
 * - Personas have visibility levels so team/public templates can coexist
 *   with private ones without a separate table.
 * - Embeddings live in their own table keyed by (source_type, source_id)
 *   so the same RAG store serves personas, sessions, and global corpora.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  doublePrecision,
  pgEnum,
  index,
  uniqueIndex,
  primaryKey,
  vector,
} from "drizzle-orm/pg-core";

// ─── Enums ──────────────────────────────────────────────────────────────────
export const phaseEnum = pgEnum("phase", [
  "setup",
  "opening",
  "critique",
  "consensus_check",
  "adaptive_round",
  "synthesis",
  "completed",
  "paused",
  "failed",
]);

export const speakerRoleEnum = pgEnum("speaker_role", [
  "agent",
  "human",
  "judge",
  "secretary",
]);

export const visibilityEnum = pgEnum("visibility", ["private", "team", "public"]);

// ─── Users & teams ───────────────────────────────────────────────────────────
// Extended for Better Auth: emailVerified, image, and updatedAt were added.
// Existing columns (id, email, name, createdAt) are preserved as-is.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Auth tables (Better Auth) ───────────────────────────────────────────────
// Named auth_sessions / auth_accounts / auth_verifications to avoid collision
// with Parloir's existing `sessions` table. Better Auth is configured below
// (in auth/config.ts) to use these names via the schema mapping option.
export const authSessions = pgTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authAccounts = pgTable("auth_accounts", {
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  idToken: text("id_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
  },
  (t) => ({ pk: primaryKey({ columns: [t.teamId, t.userId] }) }),
);

// ─── Personas ───────────────────────────────────────────────────────────────
export const personas = pgTable(
  "personas",
  {
    id: text("id").primaryKey(), // human-friendly slug, e.g. "skeptical_auditor"
    name: text("name").notNull(),
    role: text("role").notNull(),
    systemPrompt: text("system_prompt").notNull(),
    model: text("model").notNull(), // "anthropic/claude-opus-4.6"
    temperature: doublePrecision("temperature").notNull().default(0.5),
    toolIds: jsonb("tool_ids").$type<string[]>().notNull().default([]),
    ragSourceIds: jsonb("rag_source_ids").$type<string[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    visibility: visibilityEnum("visibility").notNull().default("private"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    ownerIdx: index("personas_owner_idx").on(t.ownerId),
    teamIdx: index("personas_team_idx").on(t.teamId),
    visibilityIdx: index("personas_visibility_idx").on(t.visibility),
  }),
);

// ─── Sessions ───────────────────────────────────────────────────────────────
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    question: text("question").notNull(),
    context: text("context").notNull().default(""),
    status: phaseEnum("status").notNull().default("setup"),
    currentRound: integer("current_round").notNull().default(0),
    protocol: jsonb("protocol")
      .$type<{
        maxCritiqueRounds: number;
        consensusThreshold: number;
        enableAdaptiveRound: boolean;
        hideConfidenceScores: boolean;
        requireNovelty: boolean;
        judgeModel: string;
        synthesizerModel: string;
      }>()
      .notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    pauseRequestedAt: timestamp("pause_requested_at", { withTimezone: true }),
    pausedAtPhase: phaseEnum("paused_at_phase"),
  },
  (t) => ({
    createdByIdx: index("sessions_created_by_idx").on(t.createdBy),
    statusIdx: index("sessions_status_idx").on(t.status),
  }),
);

// ─── Participants (persona instances in a session) ──────────────────────────
export const participants = pgTable(
  "participants",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    personaId: text("persona_id")
      .notNull()
      .references(() => personas.id, { onDelete: "restrict" }),
    seatIndex: integer("seat_index").notNull(),
    silenced: boolean("silenced").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.personaId] }),
    seatIdx: uniqueIndex("participants_seat_idx").on(t.sessionId, t.seatIndex),
  }),
);

// ─── Turns (the transcript) ─────────────────────────────────────────────────
export const turns = pgTable(
  "turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    phase: phaseEnum("phase").notNull(),
    roundNumber: integer("round_number").notNull(),
    turnIndex: integer("turn_index").notNull(),
    speakerRole: speakerRoleEnum("speaker_role").notNull(),
    speakerId: text("speaker_id").notNull(), // persona.id or user.id
    speakerName: text("speaker_name").notNull(),
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls")
      .$type<
        Array<{
          id: string;
          toolName: string;
          args: Record<string, unknown>;
          result: unknown;
          durationMs: number;
        }>
      >()
      .notNull()
      .default([]),
    references: jsonb("references").$type<string[]>().notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionOrderIdx: index("turns_session_order_idx").on(
      t.sessionId,
      t.roundNumber,
      t.turnIndex,
    ),
  }),
);

// ─── Consensus reports (one per consensus check call) ───────────────────────
export const consensusReports = pgTable(
  "consensus_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    afterRound: integer("after_round").notNull(),
    report: jsonb("report").notNull(), // full ConsensusReport
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("consensus_session_idx").on(t.sessionId, t.afterRound),
  }),
);

// ─── Synthesis artifacts (the deliverable) ──────────────────────────────────
export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // "synthesis" | "export_md" | "export_docx" | "export_notion"
    content: jsonb("content").notNull(),
    transcriptMarkdown: text("transcript_markdown"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ sessionIdx: index("artifacts_session_idx").on(t.sessionId, t.type) }),
);

// ─── Session events (stream queue between Inngest workflow and SSE endpoint) ──
// Append-only event log. The SSE endpoint tails this table to push events to
// the connected browser. Using Postgres as the queue means: no extra infra,
// events persist across disconnects, and users can reconnect and replay.
export const sessionEvents = pgTable(
  "session_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    // Monotonic sequence per session — easier than comparing timestamps when
    // consumers reconnect and ask "everything after event #42".
    seq: integer("seq").notNull(),
    payload: jsonb("payload").notNull(), // StreamEvent
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionSeqIdx: uniqueIndex("session_events_seq_idx").on(t.sessionId, t.seq),
  }),
);

// ─── Pending human injections (queued during pause) ─────────────────────────
// Injections are inserted by /api/sessions/[id]/inject. The orchestrator
// drains them at every phase boundary, appending each as a human Turn. The
// `deliveredAt` column is how we mark a row as consumed — we do not delete,
// so we keep an audit trail of every interjection attempt.
export const pendingInjections = pgTable(
  "pending_injections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdByName: text("created_by_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredTurnId: uuid("delivered_turn_id").references(() => turns.id, {
      onDelete: "set null",
    }),
  },
  (t) => ({
    sessionPendingIdx: index("pending_injections_session_idx").on(
      t.sessionId,
      t.deliveredAt,
    ),
  }),
);

// ─── RAG sources + embeddings ───────────────────────────────────────────────
export const ragSources = pgTable("rag_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").references(() => users.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// pgvector column — requires CREATE EXTENSION vector (see db/migrations/0000_setup.sql).
export const embeddings = pgTable(
  "embeddings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => ragSources.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    // 1536 dims = OpenAI text-embedding-3-small.
    embedding: vector("embedding", { dimensions: 1536 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sourceIdx: index("embeddings_source_idx").on(t.sourceId),
    // ivfflat index must be created via raw SQL migration — see db/migrations/.
  }),
);
