/**
 * Persona loader. Loads from DB for user-created personas, or from the
 * templates directory for defaults.
 *
 * TODO: implement DB loader. For now, reads from personas/templates/*.json.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { Persona } from "@/lib/orchestrator/types";

const TEMPLATES_DIR = path.join(process.cwd(), "personas", "templates");

export async function loadPersona(personaId: string): Promise<Persona> {
  // TODO: check DB first, fall back to templates.
  const filename = personaId.replace(/[^a-zA-Z0-9_-]/g, "") + ".json";
  const filepath = path.join(TEMPLATES_DIR, filename);
  const content = await fs.readFile(filepath, "utf-8");
  return JSON.parse(content);
}

export async function listTemplatePersonas(): Promise<Persona[]> {
  const files = await fs.readdir(TEMPLATES_DIR);
  const personas = await Promise.all(
    files
      .filter((f) => f.endsWith(".json"))
      .map(async (f) => {
        const content = await fs.readFile(path.join(TEMPLATES_DIR, f), "utf-8");
        return JSON.parse(content) as Persona;
      }),
  );
  return personas;
}
