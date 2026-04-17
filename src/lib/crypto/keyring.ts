import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

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
  payload: string;  // base64
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
    payload: payload.toString("base64"),
  };
}

export function decrypt(ct: Ciphertext): string {
  const key = getKey();
  const iv = Buffer.from(ct.iv, "base64");
  const tag = Buffer.from(ct.tag, "base64");
  const payload = Buffer.from(ct.payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString("utf8");
}
