import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db/client";
import {
  users,
  authSessions,
  authAccounts,
  authVerifications,
} from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    // Map Better Auth's default table names to our prefixed names so they
    // don't collide with Parloir's existing `sessions` table.
    schema: {
      user: users,
      session: authSessions,
      account: authAccounts,
      verification: authVerifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  session: { expiresIn: 60 * 60 * 24 * 30 },
  // In-memory rate limit — single instance only, resets on restart. Good
  // enough to deter brute-force on sign-in and mass-signup from one IP.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "memory",
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  // users.id is uuid defaultRandom() — let Postgres generate it so Better
  // Auth doesn't supply a string ID that fails the uuid type check.
  advanced: { database: { generateId: false } },
});
