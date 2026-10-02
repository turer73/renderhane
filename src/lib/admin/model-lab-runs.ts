import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { LAB_CATALOG, type LabModel } from "./model-lab-catalog";
import {
  STALE_STORAGE_MS,
  STALE_SUBMITTING_MS,
  type LabRunDto,
  type LabRunStatus,
  type LabStorageState,
} from "./model-lab-flow";
import { LAB_BUCKET, LAB_LINK_TTL_SECONDS, type LabStoredOutput } from "./model-lab-storage";

/**
 * Server-owned Model Lab history (public.model_lab_runs). Every query is
 * scoped to the signed-in admin's user id; the table has RLS with no client
 * policies, so this module (service role) is the only reader and writer.
 */

type AdminClient = ReturnType<typeof createAdminClient>;

export const LAB_RUNS_TABLE = "model_lab_runs";
export const LAB_HISTORY_PAGE = 20;

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
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  expires_at: string;
}

const COLUMNS =
  "id, user_id, client_request_id, model_key, endpoint, status, request_id, receipt, inputs, outputs, storage_state, error_code, error_message, created_at, updated_at, completed_at, expires_at";

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
  // The same browser attempt arrived again: return it, never submit twice.
  const { data: existing } = await admin
    .from(LAB_RUNS_TABLE)
    .select(COLUMNS)
    .eq("user_id", input.userId)
    .eq("client_request_id", input.clientRequestId)
    .maybeSingle();
  return existing ? { row: existing as LabRunRow, duplicate: true } : null;
}

/**
 * Update a run the admin owns. `whenStatus` / `whenStorage` make it a
 * compare-and-set, so two tabs cannot both claim the same transition.
 */
export async function updateLabRun(
  admin: AdminClient,
  userId: string,
  id: string,
  patch: Partial<Omit<LabRunRow, "id" | "user_id" | "client_request_id" | "created_at">>,
  guard: { whenStatus?: LabRunStatus[]; whenStorage?: LabStorageState[]; whenUpdatedAt?: string } = {}
): Promise<LabRunRow | null> {
  let query = admin
    .from(LAB_RUNS_TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);
  if (guard.whenStatus) query = query.in("status", guard.whenStatus);
  if (guard.whenStorage) query = query.in("storage_state", guard.whenStorage);
  // Same-state retries (e.g. a stale 'pending') need the row version to exclude each other.
  if (guard.whenUpdatedAt) query = query.eq("updated_at", guard.whenUpdatedAt);
  const { data, error } = await query.select(COLUMNS).maybeSingle();
  return error ? null : ((data as LabRunRow | null) ?? null);
}

export async function getLabRun(admin: AdminClient, userId: string, id: string): Promise<LabRunRow | null> {
  const { data, error } = await admin.from(LAB_RUNS_TABLE).select(COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  return error ? null : ((data as LabRunRow | null) ?? null);
}

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
    .lt("expires_at", now.toISOString())
    .limit(limit);
  return (data as LabRunRow[] | null) ?? [];
}

export async function deleteLabRunRow(admin: AdminClient, userId: string, id: string): Promise<boolean> {
  const { error } = await admin.from(LAB_RUNS_TABLE).delete().eq("id", id).eq("user_id", userId);
  return !error;
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

/**
 * Lab-uploaded inputs of this run that no other run still uses. An upload
 * outside the lab folder (e.g. pasted from a main-app job) is never deleted,
 * and neither is anything in `keep` (inputs still in the open form).
 */
export async function unsharedUploadPaths(admin: AdminClient, row: LabRunRow, keep: readonly string[] = []): Promise<string[]> {
  const paths = [...new Set(row.inputs.flatMap((input) => (input.kind === "upload" ? [input.path] : [])))]
    .filter((path) => isLabInputPath(path, row.user_id) && !keep.includes(path));
  const unshared: string[] = [];
  for (const path of paths) {
    if ((await labInputUseCount(admin, row.user_id, path, row.id)) === 0) unshared.push(path);
  }
  return unshared;
}

/**
 * Uploaded inputs older than `maxAgeMs` that no run uses: left behind when a
 * form was abandoned. Bounded per call; the oldest are checked first.
 */
export async function staleUnusedLabInputs(admin: AdminClient, userId: string, now: Date, maxAgeMs: number, limit = 50): Promise<string[]> {
  const folder = labInputPrefix(userId).slice(0, -1);
  const { data, error } = await admin.storage.from(LAB_BUCKET).list(folder, { limit, sortBy: { column: "created_at", order: "asc" } });
  if (error || !data) return [];
  const cutoff = now.getTime() - maxAgeMs;
  const unused: string[] = [];
  for (const entry of data) {
    // Folder placeholders have no id; unparsable dates are kept.
    if (!entry.id || !entry.created_at || !(Date.parse(entry.created_at) < cutoff)) continue;
    const path = `${folder}/${entry.name}`;
    if (isLabInputPath(path, userId) && (await labInputUseCount(admin, userId, path)) === 0) unused.push(path);
  }
  return unused;
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

/** Claimed storage that never finished can be claimed again. */
export function isStorageRetryable(row: Pick<LabRunRow, "status" | "storage_state" | "updated_at">, now = Date.now()): boolean {
  if (row.status !== "completed") return false;
  if (row.storage_state === "failed" || row.storage_state === "partial") return true;
  return row.storage_state === "pending" && now - Date.parse(row.updated_at) > STALE_STORAGE_MS;
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
