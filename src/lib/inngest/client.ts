/**
 * Inngest client. Background workflow execution bypassing Vercel's 300s timeout.
 *
 * Locally: run `pnpm inngest:dev` — the dev server auto-discovers functions
 * and gives you a UI at localhost:8288 for debugging.
 *
 * In prod: deploy the /api/inngest route; Inngest Cloud invokes it.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "roundtable",
  name: "Roundtable",
});
