CREATE TYPE "public"."phase" AS ENUM('setup', 'opening', 'critique', 'consensus_check', 'adaptive_round', 'synthesis', 'completed', 'paused', 'failed');--> statement-breakpoint
CREATE TYPE "public"."speaker_role" AS ENUM('agent', 'human', 'judge', 'secretary');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('private', 'team', 'public');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"content" jsonb NOT NULL,
	"transcript_markdown" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consensus_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"after_round" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "participants" (
	"session_id" uuid NOT NULL,
	"persona_id" text NOT NULL,
	"seat_index" integer NOT NULL,
	"silenced" boolean DEFAULT false NOT NULL,
	CONSTRAINT "participants_session_id_persona_id_pk" PRIMARY KEY("session_id","persona_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "personas" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"system_prompt" text NOT NULL,
	"model" text NOT NULL,
	"temperature" double precision DEFAULT 0.5 NOT NULL,
	"tool_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rag_source_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"owner_id" uuid,
	"team_id" uuid,
	"visibility" "visibility" DEFAULT 'private' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rag_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"team_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"question" text NOT NULL,
	"context" text DEFAULT '' NOT NULL,
	"status" "phase" DEFAULT 'setup' NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"protocol" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_members" (
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "team_members_team_id_user_id_pk" PRIMARY KEY("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"phase" "phase" NOT NULL,
	"round_number" integer NOT NULL,
	"turn_index" integer NOT NULL,
	"speaker_role" "speaker_role" NOT NULL,
	"speaker_id" text NOT NULL,
	"speaker_name" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"references" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "consensus_reports" ADD CONSTRAINT "consensus_reports_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "embeddings" ADD CONSTRAINT "embeddings_source_id_rag_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."rag_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participants" ADD CONSTRAINT "participants_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "participants" ADD CONSTRAINT "participants_persona_id_personas_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personas" ADD CONSTRAINT "personas_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "personas" ADD CONSTRAINT "personas_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rag_sources" ADD CONSTRAINT "rag_sources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rag_sources" ADD CONSTRAINT "rag_sources_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "turns" ADD CONSTRAINT "turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "artifacts_session_idx" ON "artifacts" USING btree ("session_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consensus_session_idx" ON "consensus_reports" USING btree ("session_id","after_round");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "embeddings_source_idx" ON "embeddings" USING btree ("source_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "participants_seat_idx" ON "participants" USING btree ("session_id","seat_index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personas_owner_idx" ON "personas" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personas_team_idx" ON "personas" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personas_visibility_idx" ON "personas" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "session_events_seq_idx" ON "session_events" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_created_by_idx" ON "sessions" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_status_idx" ON "sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "turns_session_order_idx" ON "turns" USING btree ("session_id","round_number","turn_index");