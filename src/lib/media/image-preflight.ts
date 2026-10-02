import "server-only";

import {
  DownloadTooLargeError,
  openPublicDownload,
  readResponseBuffer,
  UnsafeDownloadUrlError,
} from "@/lib/security/safe-download";
import type { ImageInputLimits } from "./image-input-contract";
import {
  checkImageCount,
  checkImageFacts,
  timeoutImageIssue,
  tooLargeToReadIssue,
  unreachableImageIssue,
  unreadableImageIssue,
  type ImageFacts,
  type ImageInputIssue,
  type ImagePosition,
} from "./image-limit-check";
import { probeImage } from "./image-probe";

/**
 * Server-side image preflight. It reads the real bytes of every input image
 * (bounded, SSRF-safe, with a timeout) and checks them against the model's
 * contract. Callers run it before any credit reservation, paid preprocessing
 * or provider submit, so a rejected image costs nothing.
 */

export class ImagePreflightError extends Error {
  constructor(readonly issues: ImageInputIssue[]) {
    super(issues[0]?.message ?? "Image input rejected");
    this.name = "ImagePreflightError";
  }
}

/** Facts already read in this request, keyed by URL; avoids re-downloads. */
export type ImageFactsCache = Map<string, ImageFacts>;

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 2;
const DATA_URL = /^data:image\/[a-z0-9.+-]+;base64,/i;

class ImageReadError extends Error {
  constructor(readonly kind: "too_large" | "unreachable" | "timeout") {
    super(kind);
  }
}

function factsFromBytes(bytes: Uint8Array, position: ImagePosition): ImageFacts | ImageInputIssue {
  const probe = probeImage(bytes);
  if (!probe.ok) return unreadableImageIssue(position);
  return { bytes: bytes.byteLength, probe: probe.image };
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

async function inspect(url: string, position: ImagePosition, limits: ImageInputLimits, cache?: ImageFactsCache): Promise<ImageFacts | ImageInputIssue> {
  const cached = cache?.get(url);
  if (cached) return cached;
  try {
    const bytes = DATA_URL.test(url) ? await readDataUrl(url, limits.maxBytes) : await readRemote(url, limits.maxBytes);
    const facts = factsFromBytes(bytes, position);
    if (cache && !("code" in facts)) cache.set(url, facts);
    return facts;
  } catch (error) {
    const kind = error instanceof ImageReadError ? error.kind : "unreachable";
    if (kind === "too_large") return tooLargeToReadIssue(position, limits);
    if (kind === "timeout") return timeoutImageIssue(position);
    return unreachableImageIssue(position);
  }
}

/**
 * Throws ImagePreflightError with every problem found; returns the facts of
 * each image (in request order) when all of them fit the limits.
 */
export async function preflightImageInputs(input: {
  urls: readonly string[];
  limits: ImageInputLimits;
  cache?: ImageFactsCache;
}): Promise<ImageFacts[]> {
  const { urls, limits, cache } = input;
  if (limits.inputKind !== "image") return [];
  const countIssue = checkImageCount(urls.length, limits);
  if (countIssue) throw new ImagePreflightError([countIssue]);

  const positions = urls.map((_, index) => ({ index, count: urls.length }));
  const inspected = await Promise.all(urls.map((url, index) => inspect(url, positions[index], limits, cache)));
  const issues: ImageInputIssue[] = [];
  const facts: ImageFacts[] = [];
  inspected.forEach((entry, index) => {
    if ("code" in entry) {
      issues.push(entry);
      return;
    }
    issues.push(...checkImageFacts(entry, limits, positions[index]));
    facts.push(entry);
  });
  if (issues.length > 0) throw new ImagePreflightError(issues);
  return facts;
}

/** JSON body for a rejected image; the HTTP status is 422. */
export function imagePreflightErrorBody(error: ImagePreflightError) {
  return {
    error: "image_input_invalid",
    message: error.issues[0]?.message ?? "Görsel bu model için uygun değil.",
    issues: error.issues.map(({ code, index, message }) => ({ code, index, message })),
  };
}
