import { isLabUuid } from "@/lib/admin/model-lab-flow";
import { labResponse, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { effectiveLabStatus, getLabRun, labRunDto, storedPathsOf, updateLabRun } from "@/lib/admin/model-lab-runs";
import { signLabPaths } from "@/lib/admin/model-lab-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

/**
 * POST — the admin checked the provider's request history for a run whose
 * submission outcome is unknown and closes it as failed. Nothing is resubmitted.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isLabUuid(id)) return labResponse({ error: "Deney bulunamadı." }, 404);
  const admin = createAdminClient();
  const row = await getLabRun(admin, user.id, id);
  if (!row) return labResponse({ error: "Deney bulunamadı." }, 404);
  if (effectiveLabStatus(row) !== "unknown") return labResponse({ error: "Yalnızca durumu belirsiz bir deney kapatılabilir." }, 409);
  const updated = await updateLabRun(admin, user.id, row.id, {
    status: "failed",
    completed_at: new Date().toISOString(),
    error_code: "manually_resolved",
    error_message: "Sağlayıcı geçmişi kontrol edildi; deney kapatıldı.",
  }, { whenStatus: ["unknown", "submitting"] });
  if (!updated) return labResponse({ error: "Deney güncellenemedi." }, 503);
  const links = await signLabPaths(admin, storedPathsOf(updated));
  return labResponse({ run: labRunDto(updated, links) }, 200);
}
