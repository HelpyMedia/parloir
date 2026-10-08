import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db/client";
import {
  users,
  authSessions,
  authAccounts,
  authVerifications,
  authRateLimits,
} from "@/lib/db/schema";
import { emailEnabled, sendVerificationEmail } from "./email";

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
      rateLimit: authRateLimits,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // On when an email provider is configured (see ./email.ts).
    requireEmailVerification: emailEnabled(),
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  emailVerification: emailEnabled()
    ? {
        sendOnSignUp: true,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) => {
          await sendVerificationEmail({ to: user.email, url });
        },
      }
    : undefined,
  session: { expiresIn: 60 * 60 * 24 * 30 },
  // Counters live in Postgres so the limit holds across serverless
  // instances: deters brute-force sign-in and mass sign-up from one IP.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 10,
    storage: "database",
    modelName: "rateLimit",
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  // users.id is uuid defaultRandom() — let Postgres generate it so Better
  // Auth doesn't supply a string ID that fails the uuid type check.
  advanced: { database: { generateId: false } },
});
