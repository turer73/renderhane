/**
 * Shared Model Lab run vocabulary for the admin API and the panel. Pure: no
 * server or browser APIs, so the rules are unit-tested once and used on both
 * sides.
 */

export type LabRunStatus = "submitting" | "queued" | "running" | "completed" | "failed" | "unknown";
export type LabOutputKind = "image" | "video" | "audio" | "glb" | "file";
export type LabStorageState = "none" | "pending" | "stored" | "partial" | "failed";

/** A submit whose acknowledgement never arrived is shown as unknown after this. */
export const STALE_SUBMITTING_MS = 2 * 60 * 1000;
/** Storage that was claimed but never finished (e.g. a timed-out request) may be retried after this. */
export const STALE_STORAGE_MS = 5 * 60 * 1000;

export interface LabRunInputDto {
  key: string;
  kind: "text" | "url" | "upload";
  value?: string;
  /** Display link: a fresh signed link for an upload, the address for a URL input. */
  url?: string | null;
}

export interface LabRunOutputDto {
  kind: LabOutputKind;
  /** True when the file is in Renderhane's private storage; false for a temporary provider link. */
  stored: boolean;
  url: string;
  downloadUrl: string;
  bytes: number | null;
  mime: string | null;
}

export interface LabRunDto {
  id: string;
  modelKey: string;
  modelName: string;
  endpoint: string;
  status: LabRunStatus;
  requestId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  expiresAt: string;
  inputs: LabRunInputDto[];
  outputs: LabRunOutputDto[];
  storage: LabStorageState;
  error: string | null;
  /** Machine code for `error`; the panel shows its own localized text for it. */
  errorCode: string | null;
  /** Signed links in this payload stop working at this time (ms since epoch). */
  linksExpireAt: number;
}

export function isActiveRun(status: LabRunStatus): boolean {
  return status === "queued" || status === "running";
}

/** Only finished runs can be deleted: an active or unknown run may still be charging. */
export function isDeletableRun(status: LabRunStatus): boolean {
  return status === "completed" || status === "failed";
}

export function providerStatusToRun(value: unknown): "queued" | "running" | "completed" | "failed" | null {
  if (value === "IN_QUEUE" || value === "QUEUED") return "queued";
  if (value === "IN_PROGRESS" || value === "RUNNING") return "running";
  if (value === "COMPLETED") return "completed";
  if (value === "FAILED" || value === "CANCELLED") return "failed";
  return null;
}

export type LabPhase = "idle" | "uploading" | "validating" | "queue" | "running" | "completed" | "failed" | "unknown";

/** The progress step to show: local work first, then the server's run state. */
export function labPhase(input: {
  uploading: boolean;
  validating: boolean;
  submitting: boolean;
  run: Pick<LabRunDto, "status"> | null;
}): LabPhase {
  if (input.uploading) return "uploading";
  if (input.validating) return "validating";
  if (input.submitting) return "queue";
  switch (input.run?.status) {
    case "submitting":
    case "queued":
      return "queue";
    case "running":
      return "running";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "unknown":
      return "unknown";
    default:
      return "idle";
  }
}

/**
 * Merge fresh runs into the list. A response that was sent earlier but
 * arrives later must not roll a run back, so the newer updatedAt wins.
 * Newest runs come first; nothing is dropped.
 */
export function mergeLabRuns(current: readonly LabRunDto[], incoming: readonly LabRunDto[]): LabRunDto[] {
  const byId = new Map(current.map((run) => [run.id, run]));
  for (const run of incoming) {
    const existing = byId.get(run.id);
    if (!existing || Date.parse(run.updatedAt) >= Date.parse(existing.updatedAt)) byId.set(run.id, run);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
}

export function removeLabRun(current: readonly LabRunDto[], id: string): LabRunDto[] {
  return current.filter((run) => run.id !== id);
}

export const LAB_POLL_MS = 5000;
const MAX_POLL_BACKOFF_MS = 60_000;
/** Signed links are refreshed this long before they stop working. */
export const LAB_LINK_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** A run whose server state can still change; it is polled until it settles. */
export function needsPolling(run: Pick<LabRunDto, "status" | "storage">): boolean {
  return run.status === "submitting" || run.status === "queued" || run.status === "running" ||
    (run.status === "completed" && run.storage === "pending");
}

export interface LabPollState {
  failures: number;
  nextAt: number;
}

/** Wait before the next poll after `failures` failed polls in a row. */
export function pollBackoffMs(failures: number): number {
  return Math.min(MAX_POLL_BACKOFF_MS, LAB_POLL_MS * 2 ** Math.max(0, failures));
}

/** Runs to poll now: unsettled, not backing off, newest first, at most `limit`. */
export function runsDueForPoll(
  runs: readonly LabRunDto[],
  now: number,
  state: Readonly<Record<string, LabPollState>>,
  limit = 6
): LabRunDto[] {
  return runs.filter((run) => needsPolling(run) && (state[run.id]?.nextAt ?? 0) <= now).slice(0, limit);
}

/** Runs showing signed storage links that stop working within the margin. */
export function runsWithExpiringLinks(runs: readonly LabRunDto[], now: number, marginMs = LAB_LINK_REFRESH_MARGIN_MS): LabRunDto[] {
  return runs.filter((run) =>
    (run.outputs.some((output) => output.stored) || run.inputs.some((input) => input.kind === "upload" && input.url)) &&
    run.linksExpireAt - now < marginMs
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLabUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
