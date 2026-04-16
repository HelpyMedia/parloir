import type { Config } from "drizzle-kit";

// drizzle-kit runs outside Next.js so it doesn't auto-load .env.local.
// Node 20.12+ ships loadEnvFile — use it instead of adding dotenv.
try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local missing — fall through to whatever is in process.env
}

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
  verbose: true,
} satisfies Config;
