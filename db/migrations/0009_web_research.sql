ALTER TYPE "public"."phase" ADD VALUE 'research' BEFORE 'opening';--> statement-breakpoint
ALTER TYPE "public"."speaker_role" ADD VALUE 'researcher';--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "sources" jsonb DEFAULT '[]'::jsonb NOT NULL;