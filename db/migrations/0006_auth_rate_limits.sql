ALTER TYPE "public"."phase" ADD VALUE 'quota_exhausted';--> statement-breakpoint
ALTER TYPE "public"."phase" ADD VALUE 'estimator_error';--> statement-breakpoint
ALTER TYPE "public"."phase" ADD VALUE 'aborted';--> statement-breakpoint
CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "auth_rate_limits_key_unique" UNIQUE("key")
);
