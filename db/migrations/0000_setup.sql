-- Manual setup before the first Drizzle migration.
-- Run: psql $DATABASE_URL -f db/migrations/0000_setup.sql

CREATE EXTENSION IF NOT EXISTS vector;

-- After Drizzle generates the embeddings table, add an ivfflat index for
-- fast approximate similarity search. Adjust lists to ~sqrt(rows) for best perf.
-- CREATE INDEX embeddings_vector_idx ON embeddings
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
