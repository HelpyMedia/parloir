import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { listTemplatePersonas } from "./index";

type PersonaInsertExecutor = Pick<typeof db, "insert">;

/**
 * Mirror the on-disk template personas into the DB so participant foreign keys
 * stay valid even on a fresh self-host install that hasn't run db:seed yet.
 */
export async function syncTemplatePersonas(
  executor: PersonaInsertExecutor = db,
) {
  const personas = await listTemplatePersonas();

  for (const p of personas) {
    await executor
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

  return personas;
}
