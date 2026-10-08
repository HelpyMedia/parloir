/**
 * Apply database migrations: install pgvector, then run every pending
 * Drizzle migration. Idempotent — safe on every deploy.
 *
 *   pnpm db:deploy                 (uses DATABASE_URL)
 *
 * Vercel runs this before `next build` (see the vercel-build script), so a
 * deploy never ships code against an older schema.
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!url) {
    console.log("[migrate] DATABASE_URL not set — skipping migrations.");
    return;
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // The embeddings table uses the vector type, so the extension must exist
    // before the first Drizzle migration runs.
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await migrate(drizzle(sql), { migrationsFolder: "db/migrations" });
    console.log("[migrate] database is up to date.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
