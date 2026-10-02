import "server-only";

import {
  DownloadTooLargeError,
  openPublicDownload,
  readResponseBuffer,
  UnsafeDownloadUrlError,
} from "@/lib/security/safe-download";
import type { ImageInputLimits } from "./image-input-contract";
import { verifyImageData } from "./image-decode-check";
import {
  checkImageCount,
  checkImageFacts,
  decodeTimeoutIssue,
  timeoutImageIssue,
  tooLargeToReadIssue,
  undecodableImageIssue,
  unreachableImageIssue,
  unreadableImageIssue,
  type ImageFacts,
  type ImageInputIssue,
  type ImagePosition,
} from "./image-limit-check";
import { probeImage } from "./image-probe";

/**
 * Server-side image preflight. It reads the real bytes of every input image
 * (bounded, SSRF-safe, with a timeout), checks them against the model's
 * contract and decodes them once (see image-decode-check). Callers run it
 * before any credit reservation, paid preprocessing or provider submit, so a
 * rejected image costs nothing.
 */

export class ImagePreflightError extends Error {
  constructor(readonly issues: ImageInputIssue[]) {
    super(issues[0]?.message ?? "Image input rejected");
    this.name = "ImagePreflightError";
  }
}

/** Facts of images already read and decoded in this request, keyed by URL; avoids re-downloads. */
export type ImageFactsCache = Map<string, ImageFacts>;

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 2;
const DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,/i;

class ImageReadError extends Error {
  constructor(readonly kind: "too_large" | "unreachable" | "timeout") {
    super(kind);
  }
}

async function readDataUrl(url: string, maxBytes: number): Promise<Uint8Array> {
  const payload = url.slice(url.indexOf(",") + 1);
  // Reject by encoded length before allocating the decoded buffer.
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if (Math.floor((payload.length * 3) / 4) - padding > maxBytes) throw new ImageReadError("too_large");
  return Buffer.from(payload, "base64");
}

async function readRemote(url: string, maxBytes: number): Promise<Uint8Array> {
  let download;
  try {
    download = await openPublicDownload(url, {
      maxBytes,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      maxRedirects: MAX_REDIRECTS,
      headers: { Accept: "image/*" },
    });
  } catch (error) {
    if (error instanceof DownloadTooLargeError) throw new ImageReadError("too_large");
    if (error instanceof UnsafeDownloadUrlError) throw new ImageReadError("unreachable");
    if (error instanceof Error && /timed out|abort/i.test(error.message)) throw new ImageReadError("timeout");
    throw new ImageReadError("unreachable");
  }
  try {
    if (download.response.statusCode !== 200) throw new ImageReadError("unreachable");
    return await readResponseBuffer(download.response, maxBytes);
  } catch (error) {
    if (error instanceof ImageReadError) throw error;
    if (error instanceof DownloadTooLargeError) throw new ImageReadError("too_large");
    if (error instanceof Error && /timed out|abort/i.test(error.message)) throw new ImageReadError("timeout");
    throw new ImageReadError("unreachable");
  } finally {
    download.close();
  }
}

type Inspection = { facts: ImageFacts } | { issues: ImageInputIssue[] };

async function inspect(url: string, position: ImagePosition, limits: ImageInputLimits, cache?: ImageFactsCache): Promise<Inspection> {
  const cached = cache?.get(url);
  if (cached) {
    const issues = checkImageFacts(cached, limits, position);
    return issues.length ? { issues } : { facts: cached };
  }
  let bytes: Uint8Array;
  try {
    bytes = DATA_URL.test(url) ? await readDataUrl(url, limits.maxBytes) : await readRemote(url, limits.maxBytes);
  } catch (error) {
    const kind = error instanceof ImageReadError ? error.kind : "unreachable";
    if (kind === "too_large") return { issues: [tooLargeToReadIssue(position, limits)] };
    if (kind === "timeout") return { issues: [timeoutImageIssue(position)] };
    return { issues: [unreachableImageIssue(position)] };
  }
  const probe = probeImage(bytes);
  if (!probe.ok) return { issues: [unreadableImageIssue(position)] };
  const facts: ImageFacts = { bytes: bytes.byteLength, probe: probe.image };
  const issues = checkImageFacts(facts, limits, position);
  if (issues.length) return { issues };
  // Only an image that fits is decoded, and only a decoded image is cached.
  const data = await verifyImageData(bytes, probe.image);
  if (data === "failed") return { issues: [undecodableImageIssue(position)] };
  if (data === "timeout") return { issues: [decodeTimeoutIssue(position)] };
  cache?.set(url, facts);
  return { facts };
}

/**
 * Throws ImagePreflightError with every problem found; returns the facts of
 * each image (in request order) when all of them fit the limits.
 */
export async function preflightImageInputs(input: {
  urls: readonly string[];
  limits: ImageInputLimits;
  cache?: ImageFactsCache;
  /** False when the caller bounds the count itself (e.g. separate image and mask fields). */
  checkCount?: boolean;
}): Promise<ImageFacts[]> {
  const { urls, limits, cache, checkCount = true } = input;
  if (limits.inputKind !== "image") return [];
  const countIssue = checkCount ? checkImageCount(urls.length, limits) : null;
  if (countIssue) throw new ImagePreflightError([countIssue]);

  const positions = urls.map((_, index) => ({ index, count: urls.length }));
  const inspected = await Promise.all(urls.map((url, index) => inspect(url, positions[index], limits, cache)));
  const issues: ImageInputIssue[] = [];
  const facts: ImageFacts[] = [];
  for (const entry of inspected) {
    if ("issues" in entry) issues.push(...entry.issues);
    else facts.push(entry.facts);
  }
  if (issues.length > 0) throw new ImagePreflightError(issues);
  return facts;
}

export const IMAGE_INPUT_INVALID = "image_input_invalid";

/**
 * JSON body for a rejected image; the HTTP status is 422. `error` carries the
 * Turkish message because existing clients show that field as is; `code` and
 * `issues` are the machine-readable part.
 */
export function imagePreflightErrorBody(error: ImagePreflightError) {
  return {
    error: error.issues[0]?.message ?? "Görsel bu model için uygun değil.",
    code: IMAGE_INPUT_INVALID,
    issues: error.issues.map(({ code, index, message, field }) => ({ code, index, message, ...(field ? { field } : {}) })),
  };
}
