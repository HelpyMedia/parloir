/**
 * The session's source registry: pure helpers shared by the orchestrator,
 * the storage adapter and the browser.
 *
 * Every page the council finds gets one stable ID ("S1", "S2", …) for the
 * whole session, so the research brief, panelists' turns and the final
 * deliverable all point at the same thing when they write [S3].
 */

import type { SessionSource } from "../orchestrator/types";

export type NewSource = Omit<SessionSource, "id">;

/** Case and trailing-slash differences don't make a page new. */
export function sourceKey(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.host.toLowerCase()}${path}${u.search}`;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/**
 * Register `incoming` after `existing`. URLs already registered keep their
 * ID, so registering the same results twice (an Inngest step retried)
 * changes nothing. Returns the full registry and the registered entry for
 * each incoming URL, in incoming order without duplicates.
 */
export function mergeSources(
  existing: SessionSource[],
  incoming: NewSource[],
): { all: SessionSource[]; resolved: SessionSource[]; added: number } {
  const all = [...existing];
  const byKey = new Map(all.map((s) => [sourceKey(s.url), s]));
  const resolved: SessionSource[] = [];
  let added = 0;
  for (const src of incoming) {
    if (!/^https?:\/\//i.test(src.url.trim())) continue;
    const key = sourceKey(src.url);
    let entry = byKey.get(key);
    if (!entry) {
      entry = { ...src, url: src.url.trim(), id: `S${all.length + 1}` };
      all.push(entry);
      byKey.set(key, entry);
      added++;
    }
    if (!resolved.includes(entry)) resolved.push(entry);
  }
  return { all, resolved, added };
}

/** "[S1] Title — https://…" lines, the form prompts and exports cite. */
export function formatSourceList(sources: Pick<SessionSource, "id" | "title" | "url">[]): string {
  return sources.map((s) => `[${s.id}] ${s.title || s.url} — ${s.url}`).join("\n");
}

/** The brief plus the source list, as panelists and the judge read it. */
export function evidenceBlock(brief: string, sources: Pick<SessionSource, "id" | "title" | "url">[]): string {
  const list = formatSourceList(sources);
  return `EVIDENCE BRIEF (live web research):\n${brief}${list ? `\n\nSOURCES:\n${list}` : ""}`;
}

const CITATION = /\[(S\d+(?:\s*[,;]\s*S\d+)*)\]/g;

/** IDs cited as [S1] or [S1, S2], in order of first appearance. */
export function citedIds(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CITATION)) {
    for (const id of m[1].split(/\s*[,;]\s*/)) if (!out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Rewrite citations through `render`, which gets each known ID and returns
 * its replacement. Unknown IDs are dropped; a bracket left with no known ID
 * disappears with the space before it.
 */
export function rewriteCitations(
  text: string,
  known: Map<string, Pick<SessionSource, "id" | "title" | "url">>,
  render: (ids: string[]) => string,
): string {
  return text.replace(new RegExp(`\\s?${CITATION.source}`, "g"), (match, list: string) => {
    const ids = list.split(/\s*[,;]\s*/).filter((id) => known.has(id));
    if (ids.length === 0) return "";
    const lead = match.startsWith("[") ? "" : match[0];
    return lead + render(ids);
  });
}

/**
 * Turn [S#] citations into markdown links to the registered pages, for
 * display. Unknown IDs are dropped, as the deliverable drops them.
 */
export function linkCitations(text: string, sources: Pick<SessionSource, "id" | "title" | "url">[]): string {
  if (sources.length === 0) return text;
  const known = new Map(sources.map((s) => [s.id, s]));
  return rewriteCitations(text, known, (ids) =>
    ids
      .map((id) => {
        const s = known.get(id);
        if (!s) return "";
        const title = (s.title || s.url).replace(/["\\\n\r]/g, " ");
        return `[\\[${id}\\]](<${s.url.replace(/[<>\s]/g, "")}> "${title}")`;
      })
      .join(""),
  );
}

const MD_LINK = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)(?:\s+"[^"]*")?\)/g;
const BARE_URL = /https?:\/\/[^\s<>"'`)\]]+/g;

/**
 * Keep only what the registry can back: drop [S#] IDs it doesn't hold and
 * every URL that isn't one of its pages (markdown links keep their text).
 * Models invent plausible URLs; a deliverable must not carry them.
 */
export function sanitizeCitations(text: string, registry: SessionSource[]): string {
  const known = new Map(registry.map((s) => [s.id, s]));
  const urls = new Set(registry.map((s) => sourceKey(s.url)));
  const isKnownUrl = (url: string) => urls.has(sourceKey(url.replace(/[.,;:!?]+$/, "")));

  let out = rewriteCitations(text, known, (ids) => `[${ids.join(", ")}]`);
  out = out.replace(MD_LINK, (whole, label: string, url: string) => (isKnownUrl(url) ? whole : label));
  // Bare URLs outside markdown links. Links that survived above are kept
  // because their URL is known.
  out = out.replace(BARE_URL, (url) => (isKnownUrl(url) ? url : ""));
  // Tidy what removals leave behind: "()" and doubled spaces.
  return out.replace(/\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").trim();
}
