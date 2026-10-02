import { getAIProvider } from "@/lib/ai";
import { buildLabInput, LAB_CATALOG, labImageInputs } from "@/lib/admin/model-lab-catalog";
import { isLabUuid } from "@/lib/admin/model-lab-flow";
import { labResponse, ownRecord, readLabJson, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { issueModelLabReceipt } from "@/lib/admin/model-lab-receipt";
import {
  insertSubmittingRun,
  labRunDto,
  sanitizeLabInputs,
  storedPathsOf,
  updateLabRun,
  type LabRunRow,
} from "@/lib/admin/model-lab-runs";
import { signLabPaths } from "@/lib/admin/model-lab-storage";
import { MODELS } from "@/lib/fal/models";
import { getImageInputLimits } from "@/lib/media/image-input-contract";
import type { ImageInputIssue } from "@/lib/media/image-limit-check";
import { ImagePreflightError, imagePreflightErrorBody, preflightImageInputs } from "@/lib/media/image-preflight";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

const MAX_BODY_BYTES = 32 * 1024;
const SUBMIT_FIELDS = ["modelKey", "values", "confirmProviderSpend", "clientRequestId"];
// A late acknowledgement may still arrive after the run was shown as unknown
// (stale submit); recording it restores tracking. A run the admin already
// closed (failed) is never reopened.
const ACKNOWLEDGEABLE: Array<"submitting" | "unknown"> = ["submitting", "unknown"];
const UNCERTAIN_MESSAGE = "Sağlayıcı yanıtı belirsiz. Yeniden göndermeden önce fal.ai istek geçmişini kontrol edin.";

function acceptedRequestId(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  try {
    const id = Reflect.get(error, "requestId");
    return typeof id === "string" && id.length > 0 && id.length <= 512 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Check every image field of a built lab input against the model contract
 * before any provider spend. Each field is checked on its own (an image and
 * its mask are separate fields), and issues carry the field key.
 */
export async function preflightLabImages(modelKey: string, input: Record<string, unknown>): Promise<void> {
  const limits = getImageInputLimits(modelKey);
  if (limits.inputKind !== "image") return;
  const issues: ImageInputIssue[] = [];
  for (const { field, urls } of labImageInputs(modelKey, input)) {
    try {
      await preflightImageInputs({ urls, limits, checkCount: false });
    } catch (error) {
      if (!(error instanceof ImagePreflightError)) throw error;
      issues.push(...error.issues.map((issue) => ({ ...issue, field })));
    }
  }
  if (issues.length) throw new ImagePreflightError(issues);
}

/** Validated model key and values, or the response to return. */
export function parseLabValues(modelKey: unknown, values: unknown): { modelKey: string; values: Record<string, string> } | Response {
  if (typeof modelKey !== "string" || modelKey.length === 0 || modelKey.length > 256 || !Object.hasOwn(MODELS, modelKey)) {
    return labResponse({ error: "Bilinmeyen model anahtarı." }, 400);
  }
  if (!ownRecord(values) || !Object.values(values).every((value) => typeof value === "string")) {
    return labResponse({ error: "Model alanları geçersiz." }, 400);
  }
  return { modelKey, values: values as Record<string, string> };
}

async function respondWithRun(
  admin: ReturnType<typeof createAdminClient>,
  row: LabRunRow,
  status: number,
  extra: Record<string, unknown> = {}
) {
  const links = await signLabPaths(admin, storedPathsOf(row));
  return labResponse({ ...extra, run: labRunDto(row, links) }, status);
}

export async function submitModelLabProbe(request: NextRequest): Promise<Response> {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const parsed = await readLabJson(request, MAX_BODY_BYTES);
  if (parsed instanceof Response) return parsed;
  if (Object.keys(parsed).some((key) => !SUBMIT_FIELDS.includes(key))) return labResponse({ error: "Bilinmeyen istek alanı." }, 400);
  const checked = parseLabValues(parsed.modelKey, parsed.values);
  if (checked instanceof Response) return checked;
  const { modelKey, values } = checked;
  if (parsed.confirmProviderSpend !== true) return labResponse({ error: "Sağlayıcı harcaması açıkça onaylanmalıdır." }, 400);
  // One id per browser attempt: a retried request finds its run instead of paying again.
  if (!isLabUuid(parsed.clientRequestId)) return labResponse({ error: "Deneme kimliği eksik veya geçersiz." }, 400);
  const clientRequestId = parsed.clientRequestId;
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) return labResponse({ error: "Model laboratuvarı güvenli yapılandırması eksik." }, 503);
  const limited = await rateLimit(`labsubmit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!limited.success) return labResponse({ error: "Çok fazla laboratuvar isteği gönderildi. Lütfen bekleyin." }, 429);

  let input: Record<string, unknown>;
  try {
    input = buildLabInput(modelKey, values);
  } catch {
    return labResponse({ error: "Model alanları bu deneme için uygun değil." }, 400);
  }
  try {
    await preflightLabImages(modelKey, input);
  } catch (error) {
    if (error instanceof ImagePreflightError) return labResponse(imagePreflightErrorBody(error), 422);
    throw error;
  }

  const model = LAB_CATALOG.find((entry) => entry.key === modelKey);
  const endpoint = MODELS[modelKey].id;
  const admin = createAdminClient();
  // The run is recorded BEFORE the paid submit; without the record there is no submit.
  const created = await insertSubmittingRun(admin, {
    userId: user.id,
    clientRequestId,
    modelKey,
    endpoint,
    inputs: model ? sanitizeLabInputs(model, values, user.id) : [],
  });
  if (!created) return labResponse({ error: "Deney kaydı oluşturulamadı; sağlayıcıya istek gönderilmedi.", code: "history_unavailable" }, 503);
  if (created.duplicate) return respondWithRun(admin, created.row, 200, { duplicate: true });

  try {
    const queued = await getAIProvider().submit(endpoint, input);
    const receipt = issueModelLabReceipt({ userId: user.id, modelKey, endpoint, requestId: queued.requestId }, secret);
    const row = await updateLabRun(admin, user.id, created.row.id, { status: "queued", request_id: queued.requestId, receipt }, { whenStatus: ACKNOWLEDGEABLE });
    return respondWithRun(admin, row ?? { ...created.row, status: "queued", request_id: queued.requestId, receipt }, 202, {
      receipt,
      modelKey,
      requestId: queued.requestId,
      status: "IN_QUEUE",
      ...(row ? {} : { persistencePending: true }),
    });
  } catch (error) {
    // Never retry: the provider may have accepted (and will charge) the request.
    const requestId = acceptedRequestId(error);
    if (requestId) {
      const receipt = issueModelLabReceipt({ userId: user.id, modelKey, endpoint, requestId }, secret);
      const row = await updateLabRun(admin, user.id, created.row.id, { status: "queued", request_id: requestId, receipt }, { whenStatus: ACKNOWLEDGEABLE });
      return respondWithRun(admin, row ?? created.row, 502, {
        error: "Sağlayıcı yanıtı belirsiz; durum takip ediliyor.",
        submissionUncertain: true,
        receipt,
        modelKey,
        requestId,
        status: "IN_QUEUE",
      });
    }
    const row = await updateLabRun(
      admin,
      user.id,
      created.row.id,
      { status: "unknown", error_code: "submission_uncertain", error_message: UNCERTAIN_MESSAGE },
      { whenStatus: ["submitting"] }
    );
    return respondWithRun(admin, row ?? created.row, 502, {
      error: "Model isteği kuyruğa gönderilemedi. Tekrar göndermeden önce sağlayıcı durumunu kontrol edin.",
      submissionUncertain: true,
    });
  }
}
