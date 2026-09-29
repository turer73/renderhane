import { getAIProvider } from "@/lib/ai";
import { verifyModelLabReceipt } from "@/lib/admin/model-lab-receipt";
import { isAdmin } from "@/lib/auth/admin-check";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isIP } from "node:net";

const MAX_BODY_BYTES = 8 * 1024;
const MAX_OUTPUTS = 12;
const HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
type OutputKind = "image" | "video" | "audio" | "glb" | "file";
type LabOutput = { url: string; kind: OutputKind };
const response = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: HEADERS });
const ownRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

async function receiptFromBody(request: NextRequest): Promise<string | Response> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return response({ error: "İstek gövdesi çok büyük." }, 413);
  let raw: string;
  try { raw = await request.text(); } catch { return response({ error: "İstek gövdesi okunamadı." }, 400); }
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return response({ error: "İstek gövdesi çok büyük." }, 413);
  try {
    const body: unknown = JSON.parse(raw);
    if (!ownRecord(body) || Object.keys(body).length !== 1 || !Object.hasOwn(body, "receipt") || typeof body.receipt !== "string") return response({ error: "Geçersiz makbuz." }, 400);
    return body.receipt;
  } catch { return response({ error: "Geçersiz JSON gövdesi." }, 400); }
}
function sameOrigin(request: NextRequest): boolean { try { return Boolean(request.headers.get("origin")) && request.headers.get("origin") === new URL(request.url).origin; } catch { return false; } }
function isPublicHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) return false;
  try {
    const url = new URL(value);
    const normalizedHost = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname ||
      !normalizedHost.includes(".") || normalizedHost === "localhost" ||
      normalizedHost.endsWith(".localhost") || normalizedHost.endsWith(".local") ||
      normalizedHost.endsWith(".internal")) return false;
    const hostname = normalizedHost.replace(/^\[|\]$/g, "");
    if (isIP(hostname)) return false;
    return true;
  } catch { return false; }
}
const urlAt = (value: unknown): unknown => ownRecord(value) ? value.url : undefined;
function extractLabOutputs(payload: unknown): LabOutput[] {
  if (!ownRecord(payload)) return [];
  const outputs: LabOutput[] = [];
  const add = (value: unknown, kind: OutputKind) => { if (outputs.length < MAX_OUTPUTS && isPublicHttpsUrl(value) && !outputs.some((entry) => entry.url === value)) outputs.push({ url: value, kind }); };
  add(urlAt(payload.model_mesh), "glb"); add(urlAt(payload.model_glb), "glb"); add(urlAt(payload.video), "video"); add(urlAt(payload.image), "image");
  add(payload.audio_url, "audio"); add(urlAt(payload.audio_url), "audio"); add(urlAt(payload.audio), "audio");
  add(urlAt(payload.glb), "glb"); add(urlAt(payload.mesh), "file"); add(urlAt(payload.output), "file");
  if (Array.isArray(payload.images)) for (const image of payload.images.slice(0, MAX_OUTPUTS)) add(urlAt(image), "image");
  add(payload.result_url, "file");
  return outputs;
}
function normalizedStatus(value: unknown): "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | null {
  if (value === "IN_QUEUE" || value === "QUEUED") return "IN_QUEUE";
  if (value === "IN_PROGRESS" || value === "RUNNING") return "IN_PROGRESS";
  if (value === "COMPLETED") return "COMPLETED";
  if (value === "FAILED" || value === "CANCELLED") return "FAILED";
  return null;
}
function completedProviderFailure(status: Record<string, unknown>): boolean {
  const error = status.error;
  const errorType = status.error_type;
  return (typeof error === "string" && error.trim().length > 0) ||
    (typeof errorType === "string" && errorType.trim().length > 0);
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) return response({ error: "Bu işlem için yönetici yetkisi gerekiyor." }, 403);
  if (!sameOrigin(request)) return response({ error: "İstek yalnızca aynı Renderhane adresinden yapılabilir." }, 403);
  const receipt = await receiptFromBody(request);
  if (receipt instanceof Response) return receipt;
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret) return response({ error: "Model laboratuvarı güvenli yapılandırması eksik." }, 503);
  const claims = verifyModelLabReceipt(receipt, secret);
  if (!claims || claims.userId !== user.id) return response({ error: "Makbuz geçersiz veya bu kullanıcıya ait değil." }, 403);
  const limited = await rateLimit(`labstatus:${user.id}`, RATE_LIMITS.general);
  if (!limited.success) return response({ error: "Çok fazla durum sorgusu gönderildi. Lütfen bekleyin." }, 429);
  try {
    const providerStatus = await getAIProvider().status(claims.endpoint, claims.requestId);
    const state = normalizedStatus(providerStatus.status);
    if (!state) return response({ error: "Sağlayıcı tanınmayan bir durum bildirdi. Aynı makbuzla yeniden deneyin.", retryable: true, receipt }, 502);
    // fal queues may report a terminal model rejection as COMPLETED together
    // with error/error_type; never fetch or present a result in that case.
    if (state === "COMPLETED" && completedProviderFailure(providerStatus)) {
      return response({ status: "FAILED", error: "Sağlayıcı işi tamamlayamadı.", terminal: true }, 200);
    }
    if (state === "COMPLETED") {
      try { return response({ status: state, outputs: extractLabOutputs(await getAIProvider().result<unknown>(claims.endpoint, claims.requestId)) }, 200); }
      catch { return response({ error: "İş tamamlandı ancak sonuçlar henüz okunamadı. Aynı makbuzla yeniden deneyin.", retryable: true, receipt }, 502); }
    }
    if (state === "FAILED") return response({ status: state, error: "Sağlayıcı işi tamamlayamadı.", terminal: true }, 200);
    return response({ status: state }, 200);
  } catch { return response({ error: "Sağlayıcı durumu şu anda okunamadı. Aynı makbuzla yeniden deneyin.", retryable: true, receipt }, 502); }
}
