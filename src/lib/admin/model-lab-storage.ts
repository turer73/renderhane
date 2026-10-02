import "server-only";

import { isIP } from "node:net";
import type { createAdminClient } from "@/lib/supabase/admin";
import { DownloadTooLargeError, openPublicDownload, readResponseBuffer } from "@/lib/security/safe-download";
import type { LabOutputKind } from "./model-lab-flow";

/**
 * Bounded, authenticated persistence for Model Lab outputs. Provider links
 * expire, so a completed run's files are copied into the private `uploads`
 * bucket under the admin's own folder and shown through short-lived signed
 * links. Nothing here is public.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export const LAB_BUCKET = "uploads";
export const LAB_LINK_TTL_SECONDS = 3600;
export const MAX_LAB_OUTPUT_BYTES = 100_000_000;
export const MAX_LAB_RUN_OUTPUT_BYTES = 250_000_000;
const MAX_OUTPUTS = 12;
const DOWNLOAD_TIMEOUT_MS = 60_000;

export interface LabProviderOutput {
  url: string;
  kind: LabOutputKind;
}

export interface LabStoredOutput {
  kind: LabOutputKind;
  providerUrl: string;
  path: string | null;
  mime: string | null;
  bytes: number | null;
  /** Machine code only; never a URL or provider text. */
  error: "too_large" | "download_failed" | "storage_failed" | null;
}

const ownRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || !host.includes(".") ||
      host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
    return !isIP(host.replace(/^\[|\]$/g, ""));
  } catch {
    return false;
  }
}

const urlAt = (value: unknown): unknown => (ownRecord(value) ? value.url : undefined);

/** Output files in a provider result, by kind, deduplicated and capped. */
export function extractLabOutputs(payload: unknown): LabProviderOutput[] {
  if (!ownRecord(payload)) return [];
  const outputs: LabProviderOutput[] = [];
  const add = (value: unknown, kind: LabOutputKind) => {
    if (outputs.length < MAX_OUTPUTS && isPublicHttpsUrl(value) && !outputs.some((entry) => entry.url === value)) outputs.push({ url: value, kind });
  };
  add(urlAt(payload.model_mesh), "glb"); add(urlAt(payload.model_glb), "glb"); add(urlAt(payload.video), "video"); add(urlAt(payload.image), "image");
  add(payload.audio_url, "audio"); add(urlAt(payload.audio_url), "audio"); add(urlAt(payload.audio), "audio");
  add(urlAt(payload.glb), "glb"); add(urlAt(payload.mesh), "file"); add(urlAt(payload.output), "file");
  if (Array.isArray(payload.images)) for (const image of payload.images.slice(0, MAX_OUTPUTS)) add(urlAt(image), "image");
  add(payload.result_url, "file");
  return outputs;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/flac": "flac",
  "model/gltf-binary": "glb", "application/zip": "zip",
};
const DEFAULT_BY_KIND: Record<LabOutputKind, { extension: string; mime: string }> = {
  image: { extension: "png", mime: "image/png" },
  video: { extension: "mp4", mime: "video/mp4" },
  audio: { extension: "mp3", mime: "audio/mpeg" },
  glb: { extension: "glb", mime: "model/gltf-binary" },
  file: { extension: "bin", mime: "application/octet-stream" },
};

function mimeOf(header: string | string[] | undefined, kind: LabOutputKind): string {
  const value = (Array.isArray(header) ? header[0] : header)?.split(";")[0].trim().toLowerCase();
  // GLB is often served as octet-stream; the extracted kind is more specific.
  if (kind === "glb") return DEFAULT_BY_KIND.glb.mime;
  return value && Object.hasOwn(EXTENSION_BY_MIME, value) ? value : DEFAULT_BY_KIND[kind].mime;
}

export function labOutputPrefix(userId: string, runId: string): string {
  return `${userId}/model-lab/${runId}/`;
}

async function download(url: string): Promise<{ buffer: Buffer; contentType: string | string[] | undefined }> {
  const opened = await openPublicDownload(url, { maxBytes: MAX_LAB_OUTPUT_BYTES, timeoutMs: DOWNLOAD_TIMEOUT_MS, maxRedirects: 2 });
  try {
    if (opened.response.statusCode !== 200) throw new Error("download_failed");
    const buffer = await readResponseBuffer(opened.response, MAX_LAB_OUTPUT_BYTES);
    return { buffer, contentType: opened.response.headers["content-type"] };
  } finally {
    opened.close();
  }
}

/**
 * Copy provider outputs into private storage. Already-stored outputs (a
 * retry) are kept as they are; each failure is recorded per output, so a
 * partial copy still shows which files are temporary provider links.
 */
export async function persistLabOutputs(
  admin: AdminClient,
  input: { userId: string; runId: string; outputs: readonly LabProviderOutput[]; existing?: readonly LabStoredOutput[] }
): Promise<{ outputs: LabStoredOutput[]; state: "none" | "stored" | "partial" | "failed" }> {
  if (input.outputs.length === 0) return { outputs: [], state: "none" };
  const stored: LabStoredOutput[] = [];
  let total = 0;
  for (const [index, output] of input.outputs.entries()) {
    const prior = input.existing?.find((entry) => entry.providerUrl === output.url && entry.path);
    if (prior) {
      stored.push(prior);
      total += prior.bytes ?? 0;
      continue;
    }
    const failed = (error: LabStoredOutput["error"]): LabStoredOutput => ({
      kind: output.kind, providerUrl: output.url, path: null, mime: null, bytes: null, error,
    });
    let file: { buffer: Buffer; contentType: string | string[] | undefined };
    try {
      file = await download(output.url);
    } catch (error) {
      stored.push(failed(error instanceof DownloadTooLargeError ? "too_large" : "download_failed"));
      continue;
    }
    if (total + file.buffer.length > MAX_LAB_RUN_OUTPUT_BYTES) {
      stored.push(failed("too_large"));
      continue;
    }
    const mime = mimeOf(file.contentType, output.kind);
    const extension = EXTENSION_BY_MIME[mime] ?? DEFAULT_BY_KIND[output.kind].extension;
    const path = `${labOutputPrefix(input.userId, input.runId)}${index}.${extension}`;
    const { error } = await admin.storage.from(LAB_BUCKET).upload(path, file.buffer, { contentType: mime, upsert: true });
    if (error) {
      stored.push(failed("storage_failed"));
      continue;
    }
    total += file.buffer.length;
    stored.push({ kind: output.kind, providerUrl: output.url, path, mime, bytes: file.buffer.length, error: null });
  }
  const count = stored.filter((entry) => entry.path).length;
  return { outputs: stored, state: count === stored.length ? "stored" : count === 0 ? "failed" : "partial" };
}

/** Fresh view and download links for stored paths; missing ones are left out. */
export async function signLabPaths(admin: AdminClient, paths: readonly string[]): Promise<Map<string, { url: string; downloadUrl: string }>> {
  const unique = [...new Set(paths)];
  const links = new Map<string, { url: string; downloadUrl: string }>();
  if (unique.length === 0) return links;
  const bucket = admin.storage.from(LAB_BUCKET);
  const [view, attachment] = await Promise.all([
    bucket.createSignedUrls(unique, LAB_LINK_TTL_SECONDS),
    bucket.createSignedUrls(unique, LAB_LINK_TTL_SECONDS, { download: true }),
  ]);
  const downloads = new Map((attachment.data ?? []).filter((entry) => entry.path && entry.signedUrl).map((entry) => [entry.path as string, entry.signedUrl]));
  for (const entry of view.data ?? []) {
    if (entry.error || !entry.path || !entry.signedUrl) continue;
    links.set(entry.path, { url: entry.signedUrl, downloadUrl: downloads.get(entry.path) ?? entry.signedUrl });
  }
  return links;
}

export async function removeLabObjects(admin: AdminClient, paths: readonly string[]): Promise<boolean> {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return true;
  const { error } = await admin.storage.from(LAB_BUCKET).remove(unique);
  return !error;
}
