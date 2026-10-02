import { createHash } from "node:crypto";
import { getAIProvider } from "@/lib/ai";
import { isActiveRun, isLabUuid, providerStatusToRun } from "@/lib/admin/model-lab-flow";
import { labResponse, readLabJson, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { verifyModelLabReceipt, type ModelLabReceipt } from "@/lib/admin/model-lab-receipt";
import {
  effectiveLabStatus,
  findLabRunByRequest,
  getLabRun,
  insertSubmittingRun,
  isStorageRetryable,
  labRunDto,
  storedPathsOf,
  updateLabRun,
  type LabRunRow,
} from "@/lib/admin/model-lab-runs";
import { extractLabOutputs, persistLabOutputs, signLabPaths, type LabProviderOutput } from "@/lib/admin/model-lab-storage";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

// Copying a finished run's outputs into private storage happens here.
export const maxDuration = 120;

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

async function storeOutputs(admin: AdminClient, userId: string, row: LabRunRow, outputs: LabProviderOutput[]): Promise<LabRunRow> {
  const result = await persistLabOutputs(admin, { userId, runId: row.id, outputs, existing: row.outputs });
  const updated = await updateLabRun(admin, userId, row.id, { outputs: result.outputs, storage_state: result.state }, { whenStorage: ["pending"] });
  return updated ?? { ...row, outputs: result.outputs, storage_state: result.state };
}

/** Move a run one step forward using status/result reads only; never submits. */
async function advance(admin: AdminClient, userId: string, row: LabRunRow, secret: string, retryStorage: boolean): Promise<Step> {
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
    // Claim the completion once: only the request that wins copies the files.
    const claimed = await updateLabRun(admin, userId, row.id, {
      status: "completed",
      completed_at: new Date(now).toISOString(),
      outputs: outputs.map((output) => ({ kind: output.kind, providerUrl: output.url, path: null, mime: null, bytes: null, error: null })),
      storage_state: outputs.length ? "pending" : "none",
    }, { whenStatus: ["queued", "running"] });
    if (!claimed) return { row: (await getLabRun(admin, userId, row.id)) ?? row };
    return { row: outputs.length ? await storeOutputs(admin, userId, claimed, outputs) : claimed };
  }

  if (retryStorage && isStorageRetryable(row, now)) {
    const claimed = await updateLabRun(admin, userId, row.id, { storage_state: "pending" }, {
      whenStatus: ["completed"],
      whenStorage: [row.storage_state],
      whenUpdatedAt: row.updated_at,
    });
    if (!claimed) return { row: (await getLabRun(admin, userId, row.id)) ?? row };
    return { row: await storeOutputs(admin, userId, claimed, row.outputs.map((output) => ({ url: output.providerUrl, kind: output.kind }))) };
  }
  return { row };
}

export async function POST(request: NextRequest) {
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

  const admin = createAdminClient();
  let row: LabRunRow | null;
  if (legacy) {
    // A run started before server history: verify, then import it once.
    const claims = verifyModelLabReceipt(body.receipt, secret);
    if (!claims || claims.userId !== user.id) return labResponse({ error: "Makbuz geçersiz veya bu kullanıcıya ait değil." }, 403);
    row = await importLegacyRun(admin, user.id, claims, body.receipt as string);
    if (!row) return labResponse({ error: "Önceki deneme geçmişe aktarılamadı. Daha sonra tekrar deneyin." }, 503);
  } else {
    row = await getLabRun(admin, user.id, body.runId as string);
    if (!row) return labResponse({ error: "Deney bulunamadı." }, 404);
  }

  const step = await advance(admin, user.id, row, secret, body.retryStorage === true);
  const links = await signLabPaths(admin, storedPathsOf(step.row));
  return labResponse({
    run: labRunDto(step.row, links),
    ...(step.error ? { error: step.error, retryable: true } : {}),
  }, step.status ?? 200);
}
