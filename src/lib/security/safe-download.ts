import { lookup as dnsLookup } from "node:dns/promises";
import {
  request as httpRequest,
  type IncomingMessage,
  type RequestOptions as HttpRequestOptions,
} from "node:http";
import {
  request as httpsRequest,
  type RequestOptions as HttpsRequestOptions,
} from "node:https";
import { isIP } from "node:net";
import { Transform, type TransformCallback } from "node:stream";

export class UnsafeDownloadUrlError extends Error {
  constructor(message = "URL is not a safe public resource") {
    super(message);
    this.name = "UnsafeDownloadUrlError";
  }
}

export class DownloadTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Download exceeds the ${maxBytes} byte limit`);
    this.name = "DownloadTooLargeError";
  }
}

type ResolvedAddress = { address: string; family: 4 | 6 };

export interface PublicDownload {
  response: IncomingMessage;
  finalUrl: URL;
  contentLength: number | null;
  close: () => void;
}

export interface PublicDownloadOptions {
  maxBytes: number;
  timeoutMs: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  allowedHostname?: (hostname: string) => boolean;
}

function ipv4ToNumber(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value * 256) + octet;
  }
  return value >>> 0;
}

function isPublicIpv4(address: string): boolean {
  const value = ipv4ToNumber(address);
  if (value === null) return false;

  const inRange = (network: string, prefix: number) => {
    const base = ipv4ToNumber(network);
    if (base === null) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
  };

  return ![
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.0.2.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["198.51.100.0", 24],
    ["203.0.113.0", 24],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ].some(([network, prefix]) => inRange(network as string, prefix as number));
}

function parseIpv6(address: string): number[] | null {
  let value = address.toLowerCase().split("%")[0];
  if (!value) return null;

  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = ipv4ToNumber(value.slice(lastColon + 1));
    if (lastColon < 0 || ipv4 === null) return null;
    value = `${value.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;

  const parseHalf = (half: string) => {
    if (!half) return [];
    return half.split(":").map((part) => {
      if (!/^[0-9a-f]{1,4}$/.test(part)) return -1;
      return Number.parseInt(part, 16);
    });
  };

  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if ([...left, ...right].some((part) => part < 0)) return null;

  const missing = 8 - left.length - right.length;
  if (halves.length === 1 && missing !== 0) return null;
  if (halves.length === 2 && missing < 1) return null;

  const words = [...left, ...Array(Math.max(0, missing)).fill(0), ...right];
  return words.length === 8 ? words : null;
}

function isPublicIpv6(address: string): boolean {
  const words = parseIpv6(address);
  if (!words) return false;

  // IPv4-mapped/compatible addresses inherit the IPv4 classification.
  if (words.slice(0, 5).every((word) => word === 0) && (words[5] === 0 || words[5] === 0xffff)) {
    const mapped = `${words[6] >> 8}.${words[6] & 0xff}.${words[7] >> 8}.${words[7] & 0xff}`;
    return isPublicIpv4(mapped);
  }

  // Only globally routed unicast space (2000::/3). This excludes ULA,
  // link-local, multicast, documentation and transition/tunnel ranges.
  if (words[0] < 0x2000 || words[0] > 0x3fff) return false;
  if (words[0] === 0x2001 && (words[1] === 0x0000 || words[1] === 0x0db8)) return false;
  if (words[0] === 0x2002) return false;

  return true;
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function normalizeHostname(hostname: string): string {
  const withoutBrackets = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return withoutBrackets.toLowerCase().replace(/\.$/, "");
}

async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const normalized = normalizeHostname(hostname);
  if (!normalized || normalized === "localhost" || normalized.endsWith(".localhost")) {
    throw new UnsafeDownloadUrlError();
  }

  const literalFamily = isIP(normalized);
  if (literalFamily) {
    if (!isPublicIpAddress(normalized)) throw new UnsafeDownloadUrlError();
    return [{ address: normalized, family: literalFamily as 4 | 6 }];
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await dnsLookup(normalized, { all: true, verbatim: true });
  } catch {
    throw new UnsafeDownloadUrlError("Hostname could not be resolved");
  }

  if (!resolved.length || resolved.some(({ address }) => !isPublicIpAddress(address))) {
    throw new UnsafeDownloadUrlError();
  }

  return resolved.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

async function validateAndResolve(
  rawUrl: string | URL,
  allowedHostname?: (hostname: string) => boolean
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? new URL(rawUrl) : new URL(rawUrl);
  } catch {
    throw new UnsafeDownloadUrlError("Invalid URL");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new UnsafeDownloadUrlError(
      "Only credential-free HTTP(S) URLs on standard ports are allowed"
    );
  }

  const hostname = normalizeHostname(url.hostname);
  if (allowedHostname && !allowedHostname(hostname)) {
    throw new UnsafeDownloadUrlError("URL hostname is not allowed");
  }

  const addresses = await resolvePublicAddresses(hostname);
  return { url, addresses };
}

function requestPinned(
  url: URL,
  addresses: ResolvedAddress[],
  signal: AbortSignal,
  headers: Record<string, string>
): Promise<IncomingMessage> {
  const selected = addresses[0];
  const requestOptions: HttpRequestOptions = {
    protocol: url.protocol,
    hostname: selected.address,
    family: selected.family,
    port: url.protocol === "https:" ? 443 : 80,
    method: "GET",
    path: `${url.pathname}${url.search}`,
    headers: {
      ...headers,
      Host: url.host,
    },
    signal,
  };

  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:"
      ? httpsRequest(
          {
            ...requestOptions,
            servername: url.hostname,
          } satisfies HttpsRequestOptions,
          resolve
        )
      : httpRequest(requestOptions, resolve);
    request.once("error", reject);
    request.end();
  });
}

function parseContentLength(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function openPublicDownload(
  rawUrl: string,
  options: PublicDownloadOptions
): Promise<PublicDownload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const maxRedirects = options.maxRedirects ?? 3;
  let currentUrl: string | URL = rawUrl;

  try {
    for (let redirectCount = 0; ; redirectCount += 1) {
      const { url, addresses } = await validateAndResolve(currentUrl, options.allowedHostname);
      const response = await requestPinned(url, addresses, controller.signal, options.headers ?? {});

      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const location = response.headers.location;
        response.resume();
        if (!location || redirectCount >= maxRedirects) {
          throw new UnsafeDownloadUrlError("Too many or invalid redirects");
        }
        currentUrl = new URL(location, url);
        continue;
      }

      const contentLength = parseContentLength(response.headers["content-length"]);
      if (contentLength !== null && contentLength > options.maxBytes) {
        response.destroy();
        throw new DownloadTooLargeError(options.maxBytes);
      }

      return {
        response,
        finalUrl: url,
        contentLength,
        close: () => {
          clearTimeout(timeout);
          if (!response.complete) response.destroy();
        },
      };
    }
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

export class ByteLimitTransform extends Transform {
  bytesRead = 0;

  constructor(private readonly maxBytes: number) {
    super();
  }

  override _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback): void {
    const size = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk, encoding);
    this.bytesRead += size;
    if (this.bytesRead > this.maxBytes) {
      callback(new DownloadTooLargeError(this.maxBytes));
      return;
    }
    callback(null, chunk);
  }
}

export async function readResponseBuffer(response: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytesRead = 0;

  for await (const chunk of response) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.length;
    if (bytesRead > maxBytes) {
      response.destroy();
      throw new DownloadTooLargeError(maxBytes);
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, bytesRead);
}
