import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { LAB_CATALOG, type LabModel } from "./model-lab-catalog";
import {
  STALE_SUBMITTING_MS,
  type LabRunDto,
  type LabRunStatus,
  type LabStorageState,
} from "./model-lab-flow";
import { LAB_BUCKET, LAB_LINK_TTL_SECONDS, removeLabObjects, type LabStoredOutput } from "./model-lab-storage";

/**
 * Server-owned Model Lab history (public.model_lab_runs). Every query is
 * scoped to the signed-in admin's user id; the table has RLS with no client
 * policies, so this module (service role) is the only reader and writer.
 * A deleted run stays as a content-free tombstone (deleted_at) so its client
 * request id can never be paid for again; only live rows are listed or read.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export const LAB_RUNS_TABLE = "model_lab_runs";
export const LAB_INPUT_DELETIONS_TABLE = "model_lab_input_deletions";
export const LAB_HISTORY_PAGE = 20;
/**
 * How long a storage copy may run before another request may take over.
 * Longer than the status route's maxDuration, so a live copy is never overlapped.
 */
export const LAB_STORAGE_LEASE_MS = 150_000;

export type LabStoredInput =
  | { key: string; kind: "text"; value: string }
  | { key: string; kind: "url"; url: string }
  | { key: string; kind: "upload"; path: string };

export interface LabRunRow {
  id: string;
  user_id: string;
  client_request_id: string;
  model_key: string;
  endpoint: string;
  status: LabRunStatus;
  request_id: string | null;
  receipt: string | null;
  inputs: LabStoredInput[];
  outputs: LabStoredOutput[];
  storage_state: LabStorageState;
  /** Holder of the storage copy until this time; null when nobody is copying. */
  storage_lease_until: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string;
  deleted_at: string | null;
}

const COLUMNS =
  "id, user_id, client_request_id, model_key, endpoint, status, request_id, receipt, inputs, outputs, storage_state, storage_lease_until, error_code, error_message, created_at, updated_at, completed_at, expires_at, deleted_at";

/** Path in the private uploads bucket when the URL is this admin's own signed upload. */
export function ownUploadPath(url: string, userId: string): string | null {
  try {
    const parsed = new URL(url);
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!base || parsed.host !== new URL(base).host) return null;
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/sign\/uploads\/(.+)$/);
    if (!match) return null;
    const path = decodeURIComponent(match[1]);
    if (!path.startsWith(`${userId}/`) || path.split("/").includes("..")) return null;
    return path;
  } catch {
    return null;
  }
}

/** History never keeps a query string: it can carry a signed-URL token. */
function withoutQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().slice(0, 4096);
  } catch {
    return "";
  }
}

/** What history keeps of the submitted values: uploads by storage path, never by signed link. */
export function sanitizeLabInputs(model: LabModel, values: Record<string, string>, userId: string): LabStoredInput[] {
  const stored: LabStoredInput[] = [];
  for (const field of model.fields) {
    const raw = typeof values[field.key] === "string" ? values[field.key].trim() : "";
    if (!raw) continue;
    if (field.kind === "text") {
      stored.push({ key: field.key, kind: "text", value: raw.slice(0, 2000) });
      continue;
    }
    const urls = field.kind === "urls" ? raw.split(/\r?\n/).map((url) => url.trim()).filter(Boolean) : [raw];
    for (const url of urls) {
      const path = ownUploadPath(url, userId);
      if (path) stored.push({ key: field.key, kind: "upload", path });
      else {
        const shown = withoutQuery(url);
        if (shown) stored.push({ key: field.key, kind: "url", url: shown });
      }
    }
  }
  return stored;
}

export async function insertSubmittingRun(
  admin: AdminClient,
  input: { userId: string; clientRequestId: string; modelKey: string; endpoint: string; inputs: LabStoredInput[] }
): Promise<{ row: LabRunRow; duplicate: boolean } | null> {
  const { data, error } = await admin
    .from(LAB_RUNS_TABLE)
    .insert({
      user_id: input.userId,
      client_request_id: input.clientRequestId,
      model_key: input.modelKey,
      endpoint: input.endpoint,
      status: "submitting",
      inputs: input.inputs,
    })
    .select(COLUMNS)
    .single();
  if (data) return { row: data as LabRunRow, duplicate: false };
  if (error?.code !== "23505") return null;
  // The same browser attempt arrived again: return it (even a tombstone), never submit twice.
  const { data: existing } = await admin
    .from(LAB_RUNS_TABLE)
    .select(COLUMNS)
    .eq("user_id", input.userId)
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  return existing ? { row: existing as LabRunRow, duplicate: true } : null;
}

/**
 * Update a live run the admin owns. `whenStatus` / `whenStorage` /
 * `whenLease` make it a compare-and-set, so two tabs cannot both claim the
 * same transition; a tombstone is never updated.
 */
export async function updateLabRun(
  admin: AdminClient,
  userId: string,
  id: string,
  patch: Partial<Omit<LabRunRow, "id" | "user_id" | "client_request_id" | "created_at">>,
  guard: { whenStatus?: LabRunStatus[]; whenStorage?: LabStorageState[]; whenLease?: string | null; signal?: AbortSignal } = {}
): Promise<LabRunRow | null> {
  let query = admin
    .from(LAB_RUNS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("deleted_at", null);
  if (guard.whenStatus) query = query.in("status", guard.whenStatus);
  if (guard.whenStorage) query = query.in("storage_state", guard.whenStorage);
  // The storage lease fences copy progress: only its current holder may write.
  if (guard.whenLease !== undefined) {
    query = guard.whenLease === null ? query.is("storage_lease_until", null) : query.eq("storage_lease_until", guard.whenLease);
  }
  if (guard.signal) query = query.abortSignal(guard.signal);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  return error ? null : ((data as LabRunRow | null) ?? null);
}

export async function getLabRun(admin: AdminClient, userId: string, id: string): Promise<LabRunRow | null> {
  const { data, error } = await admin.from(LAB_RUNS_TABLE).select(COLUMNS).eq("id", id).eq("user_id", userId).is("deleted_at", null).maybeSingle();
  return error ? null : ((data as LabRunRow | null) ?? null);
}

/** Also finds a tombstone: a deleted run's request is not imported again. */
export async function findLabRunByRequest(admin: AdminClient, userId: string, requestId: string): Promise<LabRunRow | null> {
  const { data } = await admin.from(LAB_RUNS_TABLE).select(COLUMNS).eq("user_id", userId).eq("request_id", requestId).maybeSingle();
  return (data as LabRunRow | null) ?? null;
}

export async function listLabRuns(
  admin: AdminClient,
  userId: string,
  options: { before?: string; limit?: number } = {}
): Promise<LabRunRow[] | null> {
  let query = admin
    .from(LAB_RUNS_TABLE)
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(Math.min(options.limit ?? LAB_HISTORY_PAGE, LAB_HISTORY_PAGE));
  if (options.before) query = query.lt("created_at", options.before);
  const { data, error } = await query;
  return error ? null : ((data as LabRunRow[] | null) ?? []);
}

export async function expiredLabRuns(admin: AdminClient, userId: string, now: Date, limit = 10): Promise<LabRunRow[]> {
  const { data } = await admin
    .from(LAB_RUNS_TABLE)
    .select(COLUMNS)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .lt("expires_at", now.toISOString())
    .limit(limit);
  return (data as LabRunRow[] | null) ?? [];
}

const TOMBSTONE_STATUS: Record<LabRunStatus, "completed" | "failed" | "unknown"> = {
  completed: "completed",
  failed: "failed",
  unknown: "unknown",
  // Only expiry tombstones an unfinished run; it can no longer be tracked.
  submitting: "unknown",
  queued: "unknown",
  running: "unknown",
};

/**
 * Turn a run into a tombstone: content, receipt and storage state are
 * cleared; the row, and with it the client request id, stays. Callers remove
 * the files first.
 */
export async function tombstoneLabRun(admin: AdminClient, userId: string, row: LabRunRow): Promise<boolean> {
  const updated = await updateLabRun(admin, userId, row.id, {
    deleted_at: new Date().toISOString(),
    status: TOMBSTONE_STATUS[row.status],
    inputs: [],
    outputs: [],
    receipt: null,
    error_message: null,
    storage_state: "none",
    storage_lease_until: null,
  }, { whenStatus: [row.status] });
  return updated !== null;
}

/** The panel uploads lab inputs here. Only files under it are ever deleted by the lab. */
export function labInputPrefix(userId: string): string {
  return `${userId}/model-lab/inputs/`;
}

export function isLabInputPath(path: unknown, userId: string): path is string {
  const prefix = labInputPrefix(userId);
  if (typeof path !== "string" || path.length > 1024 || !path.startsWith(prefix)) return false;
  const name = path.slice(prefix.length);
  return name.length > 0 && !name.includes("/") && name !== "." && name !== "..";
}

/** How many of the admin's runs (other than `exceptRunId`) use an upload; null when it cannot be read. */
export async function labInputUseCount(admin: AdminClient, userId: string, path: string, exceptRunId?: string): Promise<number | null> {
  let query = admin.from(LAB_RUNS_TABLE).select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (exceptRunId) query = query.neq("id", exceptRunId);
  const { count, error } = await query.contains("inputs", [{ kind: "upload", path }]);
  return error || typeof count !== "number" ? null : count;
}

export function uploadPathsOf(inputs: readonly LabStoredInput[]): string[] {
  return [...new Set(inputs.flatMap((input) => (input.kind === "upload" ? [input.path] : [])))];
}

/** Paths among `paths` that a deletion has claimed; null when the claims cannot be read. */
export async function claimedInputDeletions(admin: AdminClient, userId: string, paths: readonly string[]): Promise<string[] | null> {
  if (paths.length === 0) return [];
  const { data, error } = await admin.from(LAB_INPUT_DELETIONS_TABLE).select("path").eq("user_id", userId).in("path", [...paths]);
  if (error || !Array.isArray(data)) return null;
  return (data as Array<{ path: string }>).map((entry) => entry.path);
}

async function claimInputDeletion(admin: AdminClient, userId: string, path: string): Promise<"claimed" | "existing" | "error"> {
  const { error } = await admin.from(LAB_INPUT_DELETIONS_TABLE).insert({ user_id: userId, path });
  if (!error) return "claimed";
  return error.code === "23505" ? "existing" : "error";
}

async function releaseInputDeletion(admin: AdminClient, userId: string, path: string): Promise<void> {
  await admin.from(LAB_INPUT_DELETIONS_TABLE).delete().eq("user_id", userId).eq("path", path);
}

/**
 * Delete lab uploads that no run uses, safely against a concurrent submit in
 * another tab: the deletion claim is written first and usage is checked
 * after it. A submit records its run first and checks for claims after it
 * (see the migration), so whichever comes second sees the other. A claim is
 * released when the file turns out to be in use or could not be removed, and
 * kept for a removed file. Uploads outside the lab folder (e.g. pasted from a
 * main-app job) are never touched.
 */
export async function deleteUnusedLabInputs(
  admin: AdminClient,
  userId: string,
  paths: readonly string[],
  options: { exceptRunId?: string } = {}
): Promise<{ removed: string[]; kept: string[]; ok: boolean }> {
  const removable: string[] = [];
  const kept: string[] = [];
  const claimedNow = new Set<string>();
  let failed = false;
  for (const path of [...new Set(paths)].filter((candidate) => isLabInputPath(candidate, userId))) {
    const claim = await claimInputDeletion(admin, userId, path);
    if (claim === "error") {
      failed = true; // cannot coordinate with submits: keep the file
      kept.push(path);
      continue;
    }
    if (claim === "claimed") claimedNow.add(path);
    const uses = await labInputUseCount(admin, userId, path, options.exceptRunId);
    if (uses !== 0) {
      if (claimedNow.delete(path)) await releaseInputDeletion(admin, userId, path);
      if (uses === null) failed = true; // usage unknown: keep the file, report the failure
      kept.push(path);
      continue;
    }
    removable.push(path);
  }
  if (removable.length > 0 && !(await removeLabObjects(admin, removable))) {
    // The files are still there: let runs use them again.
    for (const path of removable) if (claimedNow.has(path)) await releaseInputDeletion(admin, userId, path);
    return { removed: [], kept: [...kept, ...removable], ok: false };
  }
  return { removed: removable, kept, ok: !failed };
}

/**
 * Lab uploads older than `maxAgeMs`: candidates left behind by abandoned
 * forms (deleteUnusedLabInputs keeps any that a run uses). Bounded per call;
 * the oldest are listed first.
 */
export async function staleLabInputCandidates(admin: AdminClient, userId: string, now: Date, maxAgeMs: number, limit = 50): Promise<string[]> {
  const folder = labInputPrefix(userId).slice(0, -1);
  const { data, error } = await admin.storage.from(LAB_BUCKET).list(folder, { limit, sortBy: { column: "created_at", order: "asc" } });
  if (error || !data) return [];
  const cutoff = now.getTime() - maxAgeMs;
  return data
    // Folder placeholders have no id; unparsable dates are kept.
    .filter((entry) => entry.id && entry.created_at && Date.parse(entry.created_at) < cutoff)
    .map((entry) => `${folder}/${entry.name}`)
    .filter((path) => isLabInputPath(path, userId));
}

export function storedPathsOf(row: LabRunRow): string[] {
  return [
    ...row.outputs.flatMap((output) => (output.path ? [output.path] : [])),
    ...row.inputs.flatMap((input) => (input.kind === "upload" ? [input.path] : [])),
  ];
}

/** The status to show: a submit with no acknowledgement for a while is unknown. */
export function effectiveLabStatus(row: Pick<LabRunRow, "status" | "created_at">, now = Date.now()): LabRunStatus {
  if (row.status === "submitting" && now - Date.parse(row.created_at) > STALE_SUBMITTING_MS) return "unknown";
  return row.status;
}

export function storageLeaseFree(row: Pick<LabRunRow, "storage_lease_until">, now = Date.now()): boolean {
  return row.storage_lease_until === null || Date.parse(row.storage_lease_until) <= now;
}

/** A copy still to finish (released to continue, or its holder died): any status read may continue it. */
export function canContinueStorage(row: Pick<LabRunRow, "status" | "storage_state" | "storage_lease_until">, now = Date.now()): boolean {
  return row.status === "completed" && row.storage_state === "pending" && storageLeaseFree(row, now);
}

/** Failed or partly failed copies are retried only on request. */
export function canRetryStorage(row: Pick<LabRunRow, "status" | "storage_state" | "storage_lease_until">, now = Date.now()): boolean {
  return row.status === "completed" && (row.storage_state === "partial" || row.storage_state === "failed") && storageLeaseFree(row, now);
}

export function labRunDto(
  row: LabRunRow,
  links: Map<string, { url: string; downloadUrl: string }>,
  now = Date.now()
): LabRunDto {
  const model = LAB_CATALOG.find((entry) => entry.key === row.model_key);
  return {
    id: row.id,
    modelKey: row.model_key,
    modelName: model?.name ?? row.model_key,
    endpoint: row.endpoint,
    status: effectiveLabStatus(row, now),
    requestId: row.request_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    expiresAt: row.expires_at,
    inputs: row.inputs.map((input) =>
      input.kind === "text"
        ? { key: input.key, kind: "text" as const, value: input.value }
        : input.kind === "upload"
          ? { key: input.key, kind: "upload" as const, url: links.get(input.path)?.url ?? null }
          : { key: input.key, kind: "url" as const, url: input.url }
    ),
    outputs: row.outputs.map((output) => {
      const link = output.path ? links.get(output.path) : undefined;
      return link
        ? { kind: output.kind, stored: true, url: link.url, downloadUrl: link.downloadUrl, bytes: output.bytes, mime: output.mime }
        : { kind: output.kind, stored: false, url: output.providerUrl, downloadUrl: output.providerUrl, bytes: null, mime: output.mime };
    }),
    storage: row.storage_state,
    error: row.error_message,
    errorCode: row.error_code,
    linksExpireAt: now + LAB_LINK_TTL_SECONDS * 1000,
  };
}
