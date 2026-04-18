/**
 * Seed a dev user + all template personas into the DB so sessions can be
 * created without a UI. Idempotent (uses ON CONFLICT DO NOTHING).
 *
 * Run: pnpm tsx scripts/seed.ts
 * Or:  node --env-file=.env.local --import tsx scripts/seed.ts
 */

import { db } from "../src/lib/db/client";
import * as schema from "../src/lib/db/schema";
import { syncTemplatePersonas } from "../src/lib/personas/sync";

// Real users now go through Better Auth signup. The dev user only exists in
// development so scripts/seed.ts can still insert sessions directly for
// protocol iteration without signing in.
const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  // Require explicit NODE_ENV so accidentally running with unset env in a
  // production shell doesn't fall through the "development" branch and
  // silently skip the dev seed (or worse, insert the dev user in prod if
  // the branch is ever widened).
  if (!process.env.NODE_ENV) {
    throw new Error("NODE_ENV must be set explicitly (development / test / production)");
  }
  if (process.env.NODE_ENV === "development") {
    await db
      .insert(schema.users)
      .values({ id: DEV_USER_ID, email: "dev@parloir.local", name: "Dev User" })
      .onConflictDoNothing();
  }

  const personas = await syncTemplatePersonas();

  const count = personas.length;
  const userNote = process.env.NODE_ENV === "development" ? `1 dev user (${DEV_USER_ID}) and ` : "";
  console.log(`Seeded ${userNote}${count} personas:`);
  for (const p of personas) console.log(`  - ${p.id} (${p.role})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
