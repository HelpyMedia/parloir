/**
 * Lightweight Better Auth session-cookie reader for middleware.
 *
 * Middleware runs on the Edge runtime, so keep this helper dependency-free.
 * We only need to know whether a signed session cookie is present; the full
 * session verification still happens later in the auth layer.
 */

function parseCookies(cookieHeader: string): Map<string, string> {
  const cookieMap = new Map<string, string>();
  for (const part of cookieHeader.split(/;\s*/)) {
    if (!part) continue;
    const [name, ...valueParts] = part.split("=");
    if (!name) continue;
    cookieMap.set(name, valueParts.join("="));
  }
  return cookieMap;
}

export function getSessionCookie(
  request: Request | { headers: Headers },
  config?: {
    cookieName?: string;
    cookiePrefix?: string;
  },
): string | null {
  const cookies = request.headers.get("cookie");
  if (!cookies) return null;

  const {
    cookieName = "session_token",
    cookiePrefix = "better-auth",
  } = config ?? {};

  const parsed = parseCookies(cookies);
  const getCookie = (name: string) =>
    parsed.get(name) ?? parsed.get(`__Secure-${name}`) ?? null;

  return (
    getCookie(`${cookiePrefix}.${cookieName}`) ??
    getCookie(`${cookiePrefix}-${cookieName}`)
  );
}
