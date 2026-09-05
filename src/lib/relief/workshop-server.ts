import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-check";
import { readBoundedBody, workshopWorkerPath, WORKSHOP_MAX_BODY } from "./workshop";
import { parseWorkshopReply, WORKSHOP_ARTIFACT_TYPES, WORKSHOP_MAX_ARTIFACT } from "./workshop-response";
import { verifiedArtifactStream } from "./workshop-artifact-stream";

type WorkshopConfig = { origin: string; token: string; accessHeaders: Record<string, string> };

export function workshopConfig(): WorkshopConfig | null {
  if (process.env.RELIEF_WORKSHOP_ENABLED !== "true") return null;
  const token = process.env.RELIEF_WORKSHOP_TOKEN ?? "";
  const address = process.env.RELIEF_WORKSHOP_URL;
  const accessClientId = process.env.RELIEF_WORKSHOP_ACCESS_CLIENT_ID ?? "";
  const accessClientSecret = process.env.RELIEF_WORKSHOP_ACCESS_CLIENT_SECRET ?? "";
  if (!address || token.length < 32) return null;
  if (Boolean(accessClientId) !== Boolean(accessClientSecret) ||
      (accessClientId && (accessClientId.length < 20 || accessClientSecret.length < 32 ||
        /[\u0000-\u001f\u007f]/.test(accessClientId) || /[\u0000-\u001f\u007f]/.test(accessClientSecret)))) return null;
  try {
    const url = new URL(address);
    const localDev = process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(localDev && url.protocol === "http:")) ||
        url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return { origin: url.origin, token, accessHeaders: accessClientId ? {
      "CF-Access-Client-Id": accessClientId,
      "CF-Access-Client-Secret": accessClientSecret,
    } : {} };
  } catch {
    return null;
  }
}

const privateHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const workerErrors = new Set(["unauthorized", "invalid_owner", "not_found", "retry_unavailable",
  "application_json_required", "invalid_content_length", "request_limit_4MB", "truncated_request",
  "invalid_submission_or_artifact", "workshop_unavailable"]);
function error(status: number, code: string) {
  return Response.json({ error: code }, { status, headers: privateHeaders });
}

export async function proxyWorkshop(request: Request, parts: string[]): Promise<Response> {
  const path = workshopWorkerPath(parts, request.method);
  if (!path) return error(404, "not_found");
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return error(401, "authentication_required");
    if (!isAdmin(user.email)) return error(403, "admin_required");
    const config = workshopConfig();
    if (!config) return error(503, "workshop_not_configured");
    let body: Uint8Array | undefined;
    if (request.method === "POST") {
      // Cookie-authenticated mutation: same-origin required even for zero-body retry.
      if (request.headers.get("origin") !== new URL(request.url).origin) return error(403, "same_origin_required");
      if (!parts.length && request.headers.get("content-type")?.split(";")[0] !== "application/json") {
        return error(415, "application_json_required");
      }
      const declared = request.headers.get("content-length");
      if (declared && (!/^\d+$/.test(declared) || Number(declared) > WORKSHOP_MAX_BODY)) return error(413, "request_limit_4MB");
      try {
        body = await readBoundedBody(request.body, WORKSHOP_MAX_BODY);
      } catch {
        return error(413, "request_limit_4MB");
      }
    }
    // Neither the destination nor the ownership header is accepted from the browser.
    const upstream = await fetch(`${config.origin}${path}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${config.token}`, "X-Relief-Owner": user.id,
        ...config.accessHeaders,
        ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? Buffer.from(body) : undefined,
      redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(parts[1] === "artifacts" ? 270_000 : 15_000)]),
    });
    const contentType = upstream.headers.get("content-type")?.split(";")[0];
    if (parts[1] === "artifacts" && upstream.ok) {
      const declaredLength = upstream.headers.get("content-length") ?? "";
      const length = Number(declaredLength);
      const hash = upstream.headers.get("x-artifact-sha256") ?? "";
      if (!contentType || !WORKSHOP_ARTIFACT_TYPES.includes(contentType) || !/^\d+$/.test(declaredLength) ||
          !Number.isSafeInteger(length) || length <= 0 || length > WORKSHOP_MAX_ARTIFACT ||
          !/^[0-9a-f]{64}$/.test(hash) || !upstream.body) {
        await upstream.body?.cancel();
        return error(502, "invalid_worker_artifact");
      }
      const headers = new Headers(privateHeaders);
      headers.set("Content-Type", contentType);
      headers.set("Content-Length", String(length));
      const disposition = upstream.headers.get("content-disposition");
      if (disposition && /^attachment; filename="[a-zA-Z0-9_.-]+"$/.test(disposition)) {
        headers.set("Content-Disposition", contentType === "image/png" ? disposition.replace("attachment", "inline") : disposition);
      }
      headers.set("X-Artifact-SHA256", hash);
      return new Response(verifiedArtifactStream(upstream.body, length, hash), { headers });
    }
    if (contentType !== "application/json") {
      await upstream.body?.cancel();
      return error(502, "invalid_worker_response");
    }
    let decoded;
    try {
      const json = await readBoundedBody(upstream.body, 1_000_000);
      decoded = JSON.parse(new TextDecoder().decode(json));
    } catch { return error(502, "invalid_worker_response"); }
    if (!upstream.ok) {
      const code = typeof decoded?.error === "string" ? decoded.error : "workshop_unavailable";
      // Keep only protocol errors, never arbitrary upstream diagnostics.
      return error(upstream.status, workerErrors.has(code) ? code : "invalid_workshop_input");
    }
    try {
      return Response.json(parseWorkshopReply(decoded, parts, request.method), { status: upstream.status, headers: privateHeaders });
    } catch { return error(502, "invalid_worker_response"); }
  } catch {
    return error(503, "workshop_unavailable");
  }
}
