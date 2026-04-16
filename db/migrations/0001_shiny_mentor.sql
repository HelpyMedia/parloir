CREATE TABLE IF NOT EXISTS "pending_injections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_by_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivered_at" timestamp with time zone,
	"delivered_turn_id" uuid
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "pause_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "paused_at_phase" "phase";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_injections" ADD CONSTRAINT "pending_injections_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_injections" ADD CONSTRAINT "pending_injections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pending_injections" ADD CONSTRAINT "pending_injections_delivered_turn_id_turns_id_fk" FOREIGN KEY ("delivered_turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_injections_session_idx" ON "pending_injections" USING btree ("session_id","delivered_at");