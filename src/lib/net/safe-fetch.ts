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
import http from "node:http";
import https from "node:https";
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

interface ResolvedTarget {
  url: URL;
  connectHostname: string;
  hostHeader: string;
  servername?: string;
}

async function resolvePublicHttpTarget(raw: string): Promise<ResolvedTarget> {
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
  const hostHeader = url.host;

  // If the host is already a literal IP, check it directly.
  if (isIPv4(url.hostname) || isIPv6(url.hostname)) {
    if (isPrivateAddress(url.hostname) && !allowPrivate()) {
      throw new SsrfBlockedError(`private address blocked: ${url.hostname}`);
    }
    return {
      url,
      connectHostname: url.hostname,
      hostHeader,
    };
  }

  // Resolve once and connect to the validated address directly so the
  // outbound request cannot re-resolve the hostname to a different IP.
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
  return {
    url,
    connectHostname: records[0]!.address,
    hostHeader,
    servername: url.hostname,
  };
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  return (await resolvePublicHttpTarget(raw)).url;
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
  const target = await resolvePublicHttpTarget(rawUrl);
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  return await requestResolvedTarget(target, {
    method: opts.method ?? "GET",
    headers: opts.headers,
    timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBytes,
  });
}

async function requestResolvedTarget(
  target: ResolvedTarget,
  opts: Required<Pick<SafeFetchOptions, "method">> &
    Pick<SafeFetchOptions, "headers"> & {
      timeoutMs: number;
      maxBytes: number;
    },
): Promise<Response> {
  const isHttps = target.url.protocol === "https:";
  const transport = isHttps ? https : http;

  return await new Promise<Response>((resolve, reject) => {
    const headers = new Headers(opts.headers);
    headers.set("host", target.hostHeader);

    const req = transport.request(
      {
        protocol: target.url.protocol,
        hostname: target.connectHostname,
        port: target.url.port || undefined,
        method: opts.method,
        path: `${target.url.pathname}${target.url.search}`,
        headers: headersToNode(headers),
        servername: isHttps ? target.servername : undefined,
      },
      (res) => {
        const lenHeader = res.headers["content-length"];
        const declaredLength = Array.isArray(lenHeader) ? lenHeader[0] : lenHeader;
        if (declaredLength && Number(declaredLength) > opts.maxBytes) {
          res.destroy();
          reject(new SsrfBlockedError("response too large"));
          return;
        }

        const chunks: Uint8Array[] = [];
        let total = 0;

        res.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > opts.maxBytes) {
            res.destroy(new SsrfBlockedError("response too large"));
            return;
          }
          chunks.push(new Uint8Array(chunk));
        });

        res.on("end", () => {
          const body = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            body.set(chunk, offset);
            offset += chunk.byteLength;
          }
          resolve(
            new Response(body as BodyInit, {
              status: res.statusCode ?? 502,
              statusText: res.statusMessage ?? "",
              headers: nodeHeadersToWeb(res.headers),
            }),
          );
        });

        res.on("error", reject);
      },
    );

    req.on("error", reject);
    req.setTimeout(opts.timeoutMs, () => {
      req.destroy(new Error("request timed out"));
    });
    req.end();
  });
}

function headersToNode(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    out[key] = value;
  }
  return out;
}

function nodeHeadersToWeb(
  headers: http.IncomingHttpHeaders,
): Headers {
  const out = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const item of value) out.append(key, item);
      continue;
    }
    out.set(key, value);
  }
  return out;
}
