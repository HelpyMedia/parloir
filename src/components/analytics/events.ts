import { track } from "@vercel/analytics";

// Event names live here so the Vercel dashboard stays consistent. Sent from
// the browser so they pass through SiteAnalytics' URL redaction; without
// PARLOIR_VERCEL_ANALYTICS the script never loads and these are no-ops.

export function trackSignUp(): void {
  track("Sign Up");
}

export function trackDebateStarted(props: { tier: string; panelists: number; rounds: number }): void {
  track("Debate Started", props);
}
