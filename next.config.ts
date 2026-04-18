import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow the Inngest/DB client to import node:fs etc. in server components.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default withNextIntl(config);
