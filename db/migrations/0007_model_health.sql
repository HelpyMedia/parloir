CREATE TABLE "model_health" (
	"model_id" text PRIMARY KEY NOT NULL,
	"restricted_until" timestamp with time zone,
	"restricted_code" text,
	"successes" integer DEFAULT 0 NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"last_failure_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
