import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

function getKey(): Buffer {
  const keyB64 = process.env.PARLOIR_ENCRYPTION_KEY;
  if (!keyB64) {
    throw new Error("PARLOIR_ENCRYPTION_KEY is required");
  }
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) {
    throw new Error("PARLOIR_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  return key;
}

export interface Ciphertext {
  iv: string;       // base64
  tag: string;      // base64
  payload: string;  // base64, optionally prefixed with "v1:" to mark the
                    // ciphertext format version. Absence of prefix = v0
                    // (pre-versioning); decrypt handles both.
}

export function encrypt(plaintext: string): Ciphertext {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const payload = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    payload: `${VERSION}:${payload.toString("base64")}`,
  };
}

export function decrypt(ct: Ciphertext): string {
  const key = getKey();
  const iv = Buffer.from(ct.iv, "base64");
  const tag = Buffer.from(ct.tag, "base64");

  // Strip a known version prefix from the payload. Unknown / missing prefix
  // means v0 (pre-versioning) — the base64 is decoded directly.
  let payloadB64 = ct.payload;
  const match = /^v(\d+):(.*)$/s.exec(payloadB64);
  if (match) {
    // Only v1 is defined today. If we ever change the crypto parameters we'd
    // dispatch on match[1] and decrypt with the matching scheme.
    if (match[1] !== "1") {
      throw new Error(`unsupported ciphertext version: v${match[1]}`);
    }
    payloadB64 = match[2];
  }

  const payload = Buffer.from(payloadB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
}
