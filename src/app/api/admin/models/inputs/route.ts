import { labResponse, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { isLabInputPath, labInputUseCount } from "@/lib/admin/model-lab-runs";
import { removeLabObjects } from "@/lib/admin/model-lab-storage";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

/**
 * DELETE ?path=<storage path> — the admin removed or replaced an uploaded
 * input before using it. Only the admin's own lab-input folder is accepted,
 * and a file that a run in history still uses is kept.
 */
export async function DELETE(request: NextRequest) {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const paths = request.nextUrl.searchParams.getAll("path");
  if (paths.length !== 1 || !isLabInputPath(paths[0], user.id)) return labResponse({ error: "Geçersiz dosya yolu." }, 400);
  const limited = await rateLimit(`labinput:${user.id}`, RATE_LIMITS.general);
  if (!limited.success) return labResponse({ error: "Çok fazla istek gönderildi. Lütfen bekleyin." }, 429);

  const admin = createAdminClient();
  const uses = await labInputUseCount(admin, user.id, paths[0]);
  if (uses === null) return labResponse({ error: "Dosyanın kullanımı şu anda kontrol edilemedi." }, 503);
  if (uses > 0) return labResponse({ removed: false, inUse: true }, 200);
  if (!(await removeLabObjects(admin, paths))) return labResponse({ error: "Dosya silinemedi." }, 503);
  return labResponse({ removed: true }, 200);
}
