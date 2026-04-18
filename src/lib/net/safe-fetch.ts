/**
 * SSRF-hardened fetch.
 *
 * The credential-test and models routes issue server-side HTTP requests to a
 * URL the user controls (Ollama / LM Studio base URL). Without guardrails an
 * authenticated attacker can probe internal services, cloud metadata
 * endpoints, and private RFC1918 ranges — and infer their existence from
 * status codes.
 *
 * This module:
 *   - rejects non-http(s) schemes
 *   - resolves the hostname and rejects any address in a private / loopback /
 *     link-local / CGNAT / multicast / metadata range (IPv4 + IPv6)
 *   - caps response size and request time
 *   - disables redirects so a 30x can't bounce to a private range
 *
 * In non-production environments the loopback / RFC1918 block is relaxed so
 * developers can still test against `http://localhost:11434` (Ollama) and
 * similar. Set `PARLOIR_ALLOW_PRIVATE_FETCH=1` to force-allow.
 */

import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 1_000_000;

export class SsrfBlockedError extends Error {
  readonly code = "SSRF_BLOCKED";
  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  if (a === 10) return true;                           // 10.0.0.0/8
  if (a === 127) return true;                          // loopback
  if (a === 0) return true;                            // 0.0.0.0/8
  if (a === 169 && b === 254) return true;             // link-local + AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;    // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;   // 100.64.0.0/10 CGNAT
  if (a >= 224) return true;                           // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1") return true;
  if (lower === "::") return true;
  if (lower.startsWith("fe80:")) return true;          // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 unique-local
  if (lower.startsWith("ff")) return true;             // multicast
  // IPv4-mapped (::ffff:a.b.c.d) — re-check the mapped address
  const mapped = /^::ffff:([0-9a-f.:]+)$/i.exec(addr);
  if (mapped) {
    const tail = mapped[1];
    if (isIPv4(tail) && isPrivateIPv4(tail)) return true;
  }
  return false;
}

function isPrivateAddress(addr: string): boolean {
  if (isIPv4(addr)) return isPrivateIPv4(addr);
  if (isIPv6(addr)) return isPrivateIPv6(addr);
  // If we can't classify, be safe.
  return true;
}

function allowPrivate(): boolean {
  if (process.env.PARLOIR_ALLOW_PRIVATE_FETCH === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfBlockedError("invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SsrfBlockedError(`scheme not allowed: ${url.protocol}`);
  }
  if (!url.hostname) throw new SsrfBlockedError("missing host");

  // If the host is already a literal IP, check it directly.
  if (isIPv4(url.hostname) || isIPv6(url.hostname)) {
    if (isPrivateAddress(url.hostname) && !allowPrivate()) {
      throw new SsrfBlockedError(`private address blocked: ${url.hostname}`);
    }
    return url;
  }

  // Otherwise resolve and reject if any returned address is private.
  const records = await lookup(url.hostname, { all: true }).catch(() => []);
  if (records.length === 0) {
    throw new SsrfBlockedError(`host not resolvable: ${url.hostname}`);
  }
  for (const rec of records) {
    if (isPrivateAddress(rec.address) && !allowPrivate()) {
      throw new SsrfBlockedError(
        `host resolves to private address: ${url.hostname} → ${rec.address}`,
      );
    }
  }
  return url;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  headers?: Record<string, string>;
  method?: string;
}

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const url = await assertPublicHttpUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: opts.headers,
      signal: controller.signal,
      redirect: "manual",
    });
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > maxBytes) {
      throw new SsrfBlockedError("response too large");
    }
    // Buffer the body through our cap so a missing content-length header
    // can't leak a huge response.
    const buffer = await readCapped(res, maxBytes);
    return new Response(buffer as BodyInit, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new SsrfBlockedError("response too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
