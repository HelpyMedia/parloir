import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Allow the Inngest/DB client to import node:fs etc. in server components.
    serverActions: { bodySizeLimit: "2mb" },
  },
};

export default config;
