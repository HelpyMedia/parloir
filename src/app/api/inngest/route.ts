/**
 * Inngest webhook. Required for Inngest Cloud to invoke functions in prod,
 * and for the local dev server to discover them.
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { handlers } from "@/lib/inngest/debate-workflow";
import "@/lib/config/assert-prod";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: handlers,
});
