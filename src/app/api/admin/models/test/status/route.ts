import { createHash } from "node:crypto";
import { getAIProvider } from "@/lib/ai";
import { isActiveRun, isLabUuid, providerStatusToRun } from "@/lib/admin/model-lab-flow";
import { labResponse, readLabJson, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { verifyModelLabReceipt, type ModelLabReceipt } from "@/lib/admin/model-lab-receipt";
import {
  canContinueStorage,
  canRetryStorage,
  effectiveLabStatus,
  findLabRunByRequest,
  getLabRun,
  insertSubmittingRun,
  LAB_STORAGE_LEASE_MS,
  labRunDto,
  storedPathsOf,
  updateLabRun,
  type LabRunRow,
} from "@/lib/admin/model-lab-runs";
import { extractLabOutputs, persistLabOutputs, signLabPaths } from "@/lib/admin/model-lab-storage";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { LabDeadlineError, withinLabDeadline } from "@/lib/admin/model-lab-deadline";
import type { NextRequest } from "next/server";

// Copying a finished run's outputs into private storage happens here.
export const maxDuration = 120;
/** Copying stops by this point of a request (the rest of maxDuration answers the client). */
const COPY_BUDGET_MS = 80_000;

const MAX_BODY_BYTES = 8 * 1024;
type AdminClient = ReturnType<typeof createAdminClient>;
type Step = { row: LabRunRow; error?: string; status?: number };

function completedProviderFailure(status: Record<string, unknown>): boolean {
  const error = status.error;
  const errorType = status.error_type;
  return (typeof error === "string" && error.trim().length > 0) ||
    (typeof errorType === "string" && errorType.trim().length > 0);
}

/** Stable id for importing one legacy browser-local run exactly once. */
function legacyClientRequestId(requestId: string): string {
  const hex = createHash("sha256").update(`model-lab-legacy:${requestId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function importLegacyRun(admin: AdminClient, userId: string, claims: ModelLabReceipt, receipt: string): Promise<LabRunRow | null> {
  const existing = await findLabRunByRequest(admin, userId, claims.requestId);
  if (existing) return existing;
  const created = await insertSubmittingRun(admin, {
    userId,
    clientRequestId: legacyClientRequestId(claims.requestId),
    modelKey: claims.modelKey,
    endpoint: claims.endpoint,
    inputs: [],
  });
  if (!created) return null;
  if (created.duplicate) return created.row;
  return updateLabRun(admin, userId, created.row.id, { status: "queued", request_id: claims.requestId, receipt }, { whenStatus: ["submitting"] });
}

function leaseUntil(): string {
  return new Date(Date.now() + LAB_STORAGE_LEASE_MS).toISOString();
}

/**
 * Copy outputs while holding the storage lease the caller just claimed.
 * Progress is written after every file, fenced on the lease (which each
 * write renews), so a request that lost the lease stops without writing.
 * When the budget runs out the lease is released with the copy still
 * 'pending', and the next status read continues from the first file left.
 */
async function storeOutputs(admin: AdminClient, userId: string, claimed: LabRunRow, deadline: number, retryFailed: boolean): Promise<LabRunRow> {
  let latest = claimed;
  const fenced = async (patch: Partial<LabRunRow>, signal?: AbortSignal) => {
    const updated = await updateLabRun(admin, userId, claimed.id, patch, {
      whenStatus: ["completed"],
      whenStorage: ["pending"],
      whenLease: latest.storage_lease_until,
      signal,
    });
    if (updated) latest = updated;
    return updated;
  };
  const result = await persistLabOutputs(admin, {
    userId,
    runId: claimed.id,
    outputs: claimed.outputs.map((output) => ({ url: output.providerUrl, kind: output.kind })),
    existing: claimed.outputs,
    deadline,
    retryFailed,
    checkpoint: async (progress, signal) => (await fenced({ outputs: progress, storage_lease_until: leaseUntil() }, signal)) !== null,
  });
  if (result.fenced) return (await getLabRun(admin, userId, claimed.id)) ?? latest;
  const done = await fenced(result.state === null
    ? { outputs: result.outputs, storage_lease_until: null }
    : { outputs: result.outputs, storage_state: result.state, storage_lease_until: null });
  return done ?? (await getLabRun(admin, userId, claimed.id)) ?? latest;
}

/** Move a run one step forward using status/result reads only; never submits. */
async function advance(admin: AdminClient, userId: string, row: LabRunRow, secret: string, retryStorage: boolean, deadline: number): Promise<Step> {
  const now = Date.now();
  if (row.status === "submitting") {
    if (effectiveLabStatus(row, now) !== "unknown") return { row };
    const updated = await updateLabRun(admin, userId, row.id, {
      status: "unknown",
      error_code: "submission_unacknowledged",
      error_message: "Gönderim onayı alınamadı. Yeniden göndermeden önce fal.ai istek geçmişini kontrol edin.",
    }, { whenStatus: ["submitting"] });
    return { row: updated ?? row };
  }

  if (isActiveRun(row.status)) {
    const claims = verifyModelLabReceipt(row.receipt, secret);
    if (!claims || claims.userId !== userId || claims.requestId !== row.request_id || claims.endpoint !== row.endpoint) {
      // Do not trust a run whose signed receipt no longer matches or expired.
      const updated = await updateLabRun(admin, userId, row.id, {
        status: "unknown",
        error_code: "receipt_invalid",
        error_message: "Takip alındısının süresi doldu veya geçersiz. Sonucu fal.ai istek geçmişinden kontrol edin.",
      }, { whenStatus: ["queued", "running"] });
      return { row: updated ?? row };
    }
    let providerStatus: Record<string, unknown>;
    try {
      providerStatus = (await getAIProvider().status(claims.endpoint, claims.requestId)) as unknown as Record<string, unknown>;
    } catch {
      return { row, status: 502, error: "Sağlayıcı durumu şu anda okunamadı. Daha sonra tekrar deneyin." };
    }
    const state = providerStatusToRun(providerStatus.status);
    if (!state) return { row, status: 502, error: "Sağlayıcı tanınmayan bir durum bildirdi. Daha sonra tekrar deneyin." };
    if (state === "queued" || state === "running") {
      if (state === row.status) return { row };
      const updated = await updateLabRun(admin, userId, row.id, { status: state }, { whenStatus: ["queued", "running"] });
      return { row: updated ?? row };
    }
    // fal may report a terminal model rejection as COMPLETED with error fields.
    if (state === "failed" || completedProviderFailure(providerStatus)) {
      const updated = await updateLabRun(admin, userId, row.id, {
        status: "failed",
        completed_at: new Date(now).toISOString(),
        error_code: "provider_failed",
        error_message: "Sağlayıcı işi tamamlayamadı.",
      }, { whenStatus: ["queued", "running"] });
      return { row: updated ?? row };
    }
    let payload: unknown;
    try {
      payload = await getAIProvider().result<unknown>(claims.endpoint, claims.requestId);
    } catch {
      return { row, status: 502, error: "İş tamamlandı ancak sonuçlar henüz okunamadı. Daha sonra tekrar deneyin." };
    }
    const outputs = extractLabOutputs(payload);
    // Claim the completion once, with the storage lease: only the winner copies the files.
    const claimed = await updateLabRun(admin, userId, row.id, {
      status: "completed",
      completed_at: new Date(now).toISOString(),
      outputs: outputs.map((output) => ({ kind: output.kind, providerUrl: output.url, path: null, mime: null, bytes: null, error: null })),
      storage_state: outputs.length ? "pending" : "none",
      storage_lease_until: outputs.length ? leaseUntil() : null,
    }, { whenStatus: ["queued", "running"] });
    if (!claimed) return { row: (await getLabRun(admin, userId, row.id)) ?? row };
    return { row: outputs.length ? await storeOutputs(admin, userId, claimed, deadline, false) : claimed };
  }

  // A copy left to finish continues on any read; failed files are retried only on request.
  const continuing = canContinueStorage(row, now);
  if (continuing || (retryStorage && canRetryStorage(row, now))) {
    const claimed = await updateLabRun(admin, userId, row.id, { storage_state: "pending", storage_lease_until: leaseUntil() }, {
      whenStatus: ["completed"],
      whenStorage: [row.storage_state],
      whenLease: row.storage_lease_until,
    });
    if (!claimed) return { row: (await getLabRun(admin, userId, row.id)) ?? row };
    return { row: await storeOutputs(admin, userId, claimed, deadline, !continuing) };
  }
  return { row };
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  try {
    return await withinLabDeadline(startedAt + 100_000, (signal) => handleStatus(request, startedAt + COPY_BUDGET_MS, signal));
  } catch (error) {
    if (error instanceof LabDeadlineError) return labResponse({ error: "Durum sorgusu zaman aşımına uğradı. Yeniden kontrol edin; yeni üretim başlatılmadı.", retryable: true }, 503);
    throw error;
  }
}

async function handleStatus(request: NextRequest, deadline: number, signal: AbortSignal) {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const body = await readLabJson(request, MAX_BODY_BYTES);
  if (body instanceof Response) return body;
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) return labResponse({ error: "Model laboratuvarı güvenli yapılandırması eksik." }, 503);

  const keys = Object.keys(body);
  const legacy = keys.length === 1 && typeof body.receipt === "string";
  const byRun = isLabUuid(body.runId) && keys.every((key) => key === "runId" || key === "retryStorage") &&
    (body.retryStorage === undefined || typeof body.retryStorage === "boolean");
  if (!legacy && !byRun) return labResponse({ error: "Geçersiz durum sorgusu." }, 400);
  // Before any database or provider work, including a legacy import.
  const limited = await rateLimit(`labstatus:${user.id}`, RATE_LIMITS.general);
  if (!limited.success) return labResponse({ error: "Çok fazla durum sorgusu gönderildi. Lütfen bekleyin." }, 429);

  signal.throwIfAborted();
  const admin = createAdminClient(signal);
  let row: LabRunRow | null;
  if (legacy) {
    // A run started before server history: verify, then import it once.
    const claims = verifyModelLabReceipt(body.receipt, secret);
    if (!claims || claims.userId !== user.id) return labResponse({ error: "Makbuz geçersiz veya bu kullanıcıya ait değil." }, 403);
    row = await importLegacyRun(admin, user.id, claims, body.receipt as string);
    if (!row) return labResponse({ error: "Önceki deneme geçmişe aktarılamadı. Daha sonra tekrar deneyin." }, 503);
    // Deleted from history since: it is not brought back.
    if (row.deleted_at) return labResponse({ error: "Bu deneme geçmişten silinmiş.", code: "attempt_deleted" }, 410);
  } else {
    row = await getLabRun(admin, user.id, body.runId as string);
    if (!row) return labResponse({ error: "Deney bulunamadı." }, 404);
  }

  const step = await advance(admin, user.id, row, secret, body.retryStorage === true, deadline);
  const links = await signLabPaths(admin, storedPathsOf(step.row));
  return labResponse({
    run: labRunDto(step.row, links),
    ...(step.error ? { error: step.error, retryable: true } : {}),
  }, step.status ?? 200);
}
