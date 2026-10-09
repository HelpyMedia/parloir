"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

// Query params other than campaign tags can carry tokens (password reset,
// OAuth callbacks), so only utm_* survive.
const KEPT_PARAMS = /^utm_/;

// Session IDs identify a person's debate; the dashboard only needs the page.
const SESSION_ID = /\/sessions\/(?!new(?:\/|$))[^/]+/;

function redact(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.pathname = url.pathname.replace(SESSION_ID, "/sessions/[id]");
  for (const key of [...url.searchParams.keys()]) {
    if (!KEPT_PARAMS.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return { ...event, url: url.toString() };
}

/** Cookieless page-view analytics. Mounted only when PARLOIR_VERCEL_ANALYTICS=1. */
export function SiteAnalytics() {
  return <Analytics beforeSend={redact} />;
}
