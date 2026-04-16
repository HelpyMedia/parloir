/**
 * Seed a dev user + all template personas into the DB so sessions can be
 * created without a UI. Idempotent (uses ON CONFLICT DO NOTHING).
 *
 * Run: pnpm tsx scripts/seed.ts
 * Or:  node --env-file=.env.local --import tsx scripts/seed.ts
 */

import { db } from "../src/lib/db/client";
import * as schema from "../src/lib/db/schema";
import { listTemplatePersonas } from "../src/lib/personas";
import { sql } from "drizzle-orm";

const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

async function main() {
  await db
    .insert(schema.users)
    .values({ id: DEV_USER_ID, email: "dev@parloir.local", name: "Dev User" })
    .onConflictDoNothing();

  const personas = await listTemplatePersonas();
  for (const p of personas) {
    await db
      .insert(schema.personas)
      .values({
        id: p.id,
        name: p.name,
        role: p.role,
        systemPrompt: p.systemPrompt,
        model: p.model,
        temperature: p.temperature ?? 0.5,
        toolIds: p.toolIds ?? [],
        ragSourceIds: p.ragSourceIds ?? [],
        tags: p.tags ?? [],
        visibility: "public",
      })
      .onConflictDoUpdate({
        target: schema.personas.id,
        set: {
          name: p.name,
          role: p.role,
          systemPrompt: p.systemPrompt,
          model: p.model,
          temperature: p.temperature ?? 0.5,
          toolIds: p.toolIds ?? [],
          ragSourceIds: p.ragSourceIds ?? [],
          tags: p.tags ?? [],
          updatedAt: sql`now()`,
        },
      });
  }

  const count = personas.length;
  console.log(`Seeded 1 user (${DEV_USER_ID}) and ${count} personas:`);
  for (const p of personas) console.log(`  - ${p.id} (${p.role})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
