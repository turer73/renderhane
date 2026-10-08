import { buildLabInput } from "@/lib/admin/model-lab-catalog";
import { labResponse, readLabJson, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { ImagePreflightError, imagePreflightErrorBody } from "@/lib/media/image-preflight";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import type { NextRequest } from "next/server";
import { parseLabValues, preflightLabImages } from "../test/submit-handler";

/**
 * POST { modelKey, values } — the panel's "validating" step: build the input
 * and check every image against the model contract. Never contacts the
 * model, never spends; the submit route repeats the same checks.
 */
export async function POST(request: NextRequest) {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const body = await readLabJson(request, 32 * 1024);
  if (body instanceof Response) return body;
  if (Object.keys(body).some((key) => key !== "modelKey" && key !== "values")) return labResponse({ error: "Bilinmeyen istek alanı." }, 400);
  const checked = parseLabValues(body.modelKey, body.values);
  if (checked instanceof Response) return checked;
  const limited = await rateLimit(`labpreflight:${user.id}`, RATE_LIMITS.general);
  if (!limited.success) return labResponse({ error: "Çok fazla doğrulama isteği gönderildi. Lütfen bekleyin." }, 429);
  let input: Record<string, unknown>;
  try {
    input = buildLabInput(checked.modelKey, checked.values);
  } catch {
    return labResponse({ error: "Model alanları bu deneme için uygun değil." }, 400);
  }
  try {
    await preflightLabImages(checked.modelKey, input);
  } catch (error) {
    if (error instanceof ImagePreflightError) return labResponse(imagePreflightErrorBody(error), 422);
    throw error;
  }
  return labResponse({ ok: true }, 200);
}
