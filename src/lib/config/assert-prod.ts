/**
 * Fail-fast production config assertions.
 *
 * Some deploy-time mistakes are silently catastrophic:
 *   - no INNGEST_SIGNING_KEY → /api/inngest becomes an unsigned RPC
 *     any internet visitor can invoke against arbitrary session IDs
 *   - PARLOIR_DEV_INHERIT_ENV=1 in prod → any fresh signup inherits the
 *     operator's provider API keys from process.env
 *   - BETTER_AUTH_URL over http:// → session cookies leak in transit
 *   - PARLOIR_ENCRYPTION_KEY missing / wrong length → decryption fails
 *     only when the first user tries to start a debate, long after boot
 *
 * Import this module from any entrypoint that must not boot in a broken
 * prod config (the Inngest route, the DB client). In development every
 * check is a no-op.
 */

const isProd = process.env.NODE_ENV === "production";

let asserted = false;

export function assertProdConfig(): void {
  if (!isProd || asserted) return;
  asserted = true;

  const errors: string[] = [];

  if (!process.env.INNGEST_SIGNING_KEY) {
    errors.push(
      "INNGEST_SIGNING_KEY is required in production so the /api/inngest " +
        "webhook rejects unsigned invocations.",
    );
  }
  if (process.env.PARLOIR_DEV_INHERIT_ENV === "1") {
    errors.push(
      "PARLOIR_DEV_INHERIT_ENV=1 must not be set in production — it lets " +
        "any signed-in user use server-side provider API keys.",
    );
  }
  const authUrl = process.env.BETTER_AUTH_URL;
  if (!authUrl) {
    errors.push("BETTER_AUTH_URL is required in production.");
  } else if (!/^https:\/\//i.test(authUrl)) {
    errors.push(
      `BETTER_AUTH_URL must use https:// in production (got: ${authUrl}).`,
    );
  }
  const keyB64 = process.env.PARLOIR_ENCRYPTION_KEY;
  if (!keyB64) {
    errors.push("PARLOIR_ENCRYPTION_KEY is required.");
  } else {
    try {
      const key = Buffer.from(keyB64, "base64");
      if (key.length !== 32) {
        errors.push(
          "PARLOIR_ENCRYPTION_KEY must be 32 bytes (base64-encoded).",
        );
      }
    } catch {
      errors.push("PARLOIR_ENCRYPTION_KEY is not valid base64.");
    }
  }

  if (errors.length > 0) {
    throw new Error(
      "Refusing to boot in production — invalid config:\n  - " +
        errors.join("\n  - "),
    );
  }
}

// Run immediately at module load so the import side-effect is enough.
assertProdConfig();
