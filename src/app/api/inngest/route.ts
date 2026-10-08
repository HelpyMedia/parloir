/**
 * Inngest webhook. Required for Inngest Cloud to invoke functions in prod,
 * and for the local dev server to discover them.
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { handlers } from "@/lib/inngest/debate-workflow";
import "@/lib/config/assert-prod";

// Each invocation runs at most one step (a single model turn is capped at
// 150s), so this only needs headroom above that, not the whole debate.
export const maxDuration = 300;
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: handlers,
});
