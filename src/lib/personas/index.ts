/**
 * Persona loader. Defaults ship as static JSON imports so they survive
 * consumer bundling — parloir-cloud sets `transpilePackages: ["parloir"]`,
 * which compiles this file into `.next/server/`. Both `process.cwd()`
 * and `import.meta.url`-relative path anchors fail in that output
 * (cwd points at the consumer repo, `import.meta.url` at the bundle
 * chunk), so filesystem reads of `personas/templates/*.json` ENOENT
 * at runtime. JSON imports are inlined by Next's SWC, tsc, and node
 * ESM alike, so the templates travel with this module regardless of
 * how it's packaged.
 *
 * TODO: check DB first for user-authored personas, fall back to these
 * built-in defaults.
 */

import type { Persona } from "../orchestrator/types";
import creativeSynthesizer from "../../../personas/templates/creative_synthesizer.json";
import domainExpert from "../../../personas/templates/domain_expert.json";
import pragmaticOperator from "../../../personas/templates/pragmatic_operator.json";
import skepticalAuditor from "../../../personas/templates/skeptical_auditor.json";
import stakeholderProxy from "../../../personas/templates/stakeholder_proxy.json";

const TEMPLATES: Record<string, Persona> = {
  creative_synthesizer: creativeSynthesizer as Persona,
  domain_expert: domainExpert as Persona,
  pragmatic_operator: pragmaticOperator as Persona,
  skeptical_auditor: skepticalAuditor as Persona,
  stakeholder_proxy: stakeholderProxy as Persona,
};

export async function loadPersona(personaId: string): Promise<Persona> {
  // `Object.hasOwn` guards against prototype keys (`__proto__`,
  // `constructor`, `toString`) resolving to Object.prototype members
  // when the caller passes user input as `personaId`.
  if (!Object.hasOwn(TEMPLATES, personaId)) {
    // Preserve ENOENT semantics so callers (e.g. parloir-cloud's
    // kickoff route) can narrow bad user input away from operational
    // faults without coupling to a custom error class.
    const err: NodeJS.ErrnoException = new Error(
      `persona template not found: ${personaId}`,
    );
    err.code = "ENOENT";
    throw err;
  }
  return TEMPLATES[personaId];
}

export async function listTemplatePersonas(): Promise<Persona[]> {
  return Object.values(TEMPLATES);
}
