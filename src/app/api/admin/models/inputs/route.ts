import { labResponse, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { deleteUnusedLabInputs, isLabInputPath } from "@/lib/admin/model-lab-runs";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

/**
 * DELETE ?path=<storage path> — the admin removed or replaced an uploaded
 * input before using it. Only the admin's own lab-input folder is accepted;
 * a file a run uses is kept, also when that run is being submitted from
 * another tab at the same moment (see deleteUnusedLabInputs).
 */
export async function DELETE(request: NextRequest) {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const paths = request.nextUrl.searchParams.getAll("path");
  if (paths.length !== 1 || !isLabInputPath(paths[0], user.id)) return labResponse({ error: "Geçersiz dosya yolu." }, 400);
  const limited = await rateLimit(`labinput:${user.id}`, RATE_LIMITS.general);
  if (!limited.success) return labResponse({ error: "Çok fazla istek gönderildi. Lütfen bekleyin." }, 429);

  const result = await deleteUnusedLabInputs(createAdminClient(), user.id, paths);
  if (!result.ok) return labResponse({ error: "Dosya silinemedi." }, 503);
  if (result.removed.length === 1) return labResponse({ removed: true }, 200);
  return labResponse({ removed: false, inUse: true }, 200);
}
