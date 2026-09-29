import { getAIProvider } from "@/lib/ai";
import { buildLabInput } from "@/lib/admin/model-lab-catalog";
import { issueModelLabReceipt } from "@/lib/admin/model-lab-receipt";
import { isAdmin } from "@/lib/auth/admin-check";
import { MODELS } from "@/lib/fal/models";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const MAX_BODY_BYTES = 32 * 1024;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const response = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: HEADERS });
const ownRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

async function bodyFor(request: NextRequest): Promise<Record<string, unknown> | Response> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return response({ error: "İstek gövdesi çok büyük." }, 413);
  let raw: string;
  try { raw = await request.text(); } catch { return response({ error: "İstek gövdesi okunamadı." }, 400); }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return response({ error: "İstek gövdesi çok büyük." }, 413);
  try { const parsed: unknown = JSON.parse(raw); return ownRecord(parsed) ? parsed : response({ error: "Geçersiz istek gövdesi." }, 400); }
  catch { return response({ error: "Geçersiz JSON gövdesi." }, 400); }
}
function sameOrigin(request: NextRequest): boolean { try { return Boolean(request.headers.get("origin")) && request.headers.get("origin") === new URL(request.url).origin; } catch { return false; } }
function acceptedRequestId(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  try { const id = Reflect.get(error, "requestId"); return typeof id === "string" && id.length > 0 && id.length <= 512 ? id : null; }
  catch { return null; }
}

export async function submitModelLabProbe(request: NextRequest): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) return response({ error: "Bu işlem için yönetici yetkisi gerekiyor." }, 403);
  if (!sameOrigin(request)) return response({ error: "İstek yalnızca aynı Renderhane adresinden yapılabilir." }, 403);
  const parsed = await bodyFor(request);
  if (parsed instanceof Response) return parsed;
  const { modelKey, values, confirmProviderSpend } = parsed;
  if (Object.keys(parsed).some((key) => !["modelKey", "values", "confirmProviderSpend"].includes(key))) return response({ error: "Bilinmeyen istek alanı." }, 400);
  if (typeof modelKey !== "string" || modelKey.length === 0 || modelKey.length > 256 || !Object.hasOwn(MODELS, modelKey)) return response({ error: "Bilinmeyen model anahtarı." }, 400);
  if (!ownRecord(values) || !Object.values(values).every((value) => typeof value === "string")) return response({ error: "Model alanları geçersiz." }, 400);
  if (confirmProviderSpend !== true) return response({ error: "Sağlayıcı harcaması açıkça onaylanmalıdır." }, 400);
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) return response({ error: "Model laboratuvarı güvenli yapılandırması eksik." }, 503);
  const limited = await rateLimit(`labsubmit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!limited.success) return response({ error: "Çok fazla laboratuvar isteği gönderildi. Lütfen bekleyin." }, 429);
  let input: Record<string, unknown>;
  try { input = buildLabInput(modelKey, values as Record<string, string>); }
  catch { return response({ error: "Model alanları bu deneme için uygun değil." }, 400); }
  const endpoint = MODELS[modelKey].id;
  try {
    const queued = await getAIProvider().submit(endpoint, input);
    const receipt = issueModelLabReceipt({ userId: user.id, modelKey, endpoint, requestId: queued.requestId }, secret);
    return response({ receipt, modelKey, requestId: queued.requestId, status: "IN_QUEUE" }, 202);
  } catch (error) {
    const requestId = acceptedRequestId(error);
    if (requestId) {
      const receipt = issueModelLabReceipt({ userId: user.id, modelKey, endpoint, requestId }, secret);
      return response({ error: "Sağlayıcı yanıtı belirsiz; makbuzla durumu daha sonra kontrol edin.", submissionUncertain: true, receipt, modelKey, requestId, status: "IN_QUEUE" }, 502);
    }
    return response({ error: "Model isteği kuyruğa gönderilemedi. Tekrar göndermeden önce sağlayıcı durumunu kontrol edin.", submissionUncertain: true }, 502);
  }
}
