/**
 * Web research limits and fees. Plain constants with no imports, so the
 * cost estimate can use them in the browser.
 */

/** Exa's fee per search (up to 10 results), charged by OpenRouter even on free models. */
export const WEB_SEARCH_FEE_USD = 0.007;
/** Queries the research phase may run before the openings. */
export const MAX_RESEARCH_QUERIES = 3;
/** web_search calls one panelist turn may make. */
export const SEARCHES_PER_TURN = 1;
/** web_search calls the whole panel may make in one debate, on top of the research phase. */
export const TOOL_SEARCHES_PER_SESSION = 8;
