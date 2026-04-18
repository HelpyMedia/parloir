import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Baseline security headers applied to every response. CSP is intentionally
// permissive on styles (Tailwind + Next inject inline style attributes);
// script sources are tight. Tighten with nonces in a follow-up.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self'" + (process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval' 'unsafe-inline'"),
      "font-src 'self' https://fonts.gstatic.com data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow the Inngest/DB client to import node:fs etc. in server components.
    serverActions: { bodySizeLimit: "2mb" },
  },
  async headers() {
    return [
      {
        // Match everything; the SSE route already sets its own Cache-Control
        // and we don't override it here.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default withNextIntl(config);
