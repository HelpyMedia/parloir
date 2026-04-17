/**
 * Lightweight markdown-to-plain-text for the live ticker. We don't want a
 * full parser here — the ticker shows a rolling tail of streaming text, so
 * the output changes on every token and a real render would thrash. This
 * preserves the prose while removing marks that look like noise:
 *
 *   **bold** / *italic* / _em_ / `code` → prose
 *   # headings, > quotes, --- rules    → dropped
 *   markdown lists                      → bullets replaced with "· "
 *   blank lines / repeated whitespace   → collapsed to single spaces
 */
export function stripMarkdownForTicker(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → link text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // block quotes
    .replace(/^\s{0,3}[-*_]{3,}\s*$/gm, "") // horizontal rules
    .replace(/^\s*[-*+]\s+/gm, "· ") // bullet lists
    .replace(/^\s*\d+\.\s+/gm, "· ") // numbered lists
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/(^|\s)_(.+?)_(?=\s|$)/g, "$1$2")
    .replace(/\s+/g, " ") // collapse all whitespace (incl. newlines)
    .trim();
}
