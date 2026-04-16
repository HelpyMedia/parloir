const ACCENTS = [
  "persona-strategist",
  "persona-skeptic",
  "persona-researcher",
  "persona-implementer",
  "persona-moderator",
] as const;

export type PersonaAccent = (typeof ACCENTS)[number];

export function accentFor(personaId: string): PersonaAccent {
  let hash = 0;
  for (let i = 0; i < personaId.length; i++) {
    hash = (hash * 31 + personaId.charCodeAt(i)) | 0;
  }
  return ACCENTS[Math.abs(hash) % ACCENTS.length];
}

export function accentVar(personaId: string): string {
  return `var(--color-${accentFor(personaId)})`;
}
