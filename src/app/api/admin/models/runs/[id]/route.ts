import { isDeletableRun, isLabUuid } from "@/lib/admin/model-lab-flow";
import { labResponse, requireLabAdmin } from "@/lib/admin/model-lab-http";
import {
  deleteLabRunRow,
  effectiveLabStatus,
  getLabRun,
  isLabInputPath,
  labRunDto,
  storedPathsOf,
  unsharedUploadPaths,
} from "@/lib/admin/model-lab-runs";
import { labOutputPrefix, removeLabObjects, signLabPaths } from "@/lib/admin/model-lab-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

type Params = { params: Promise<{ id: string }> };

/** GET — one run with fresh signed links (used when earlier links expired). */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await requireLabAdmin(request, { sameOrigin: false });
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isLabUuid(id)) return labResponse({ error: "Deney bulunamadı." }, 404);
  const admin = createAdminClient();
  const row = await getLabRun(admin, user.id, id);
  if (!row) return labResponse({ error: "Deney bulunamadı." }, 404);
  const links = await signLabPaths(admin, storedPathsOf(row));
  return labResponse({ run: labRunDto(row, links) }, 200);
}

const MAX_KEEP = 16;

/**
 * DELETE ?keep=<path>… — remove a finished run, its stored outputs and any
 * lab-uploaded input no other run uses. `keep` names uploads that are still
 * in the open form, so deleting an old run does not break the next one. An
 * active or unknown run may still be charging, so it cannot be deleted.
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  const user = await requireLabAdmin(request, { sameOrigin: true });
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isLabUuid(id)) return labResponse({ error: "Deney bulunamadı." }, 404);
  const keep = request.nextUrl.searchParams.getAll("keep");
  if (keep.length > MAX_KEEP || !keep.every((path) => isLabInputPath(path, user.id))) {
    return labResponse({ error: "Korunacak dosya listesi geçersiz." }, 400);
  }
  const admin = createAdminClient();
  const row = await getLabRun(admin, user.id, id);
  if (!row) return labResponse({ error: "Deney bulunamadı." }, 404);
  if (!isDeletableRun(effectiveLabStatus(row))) {
    return labResponse({ error: "Devam eden veya durumu belirsiz bir deney silinemez." }, 409);
  }
  const prefix = labOutputPrefix(user.id, row.id);
  const outputPaths = row.outputs.flatMap((output) => (output.path?.startsWith(prefix) ? [output.path] : []));
  const removed = await removeLabObjects(admin, [...outputPaths, ...(await unsharedUploadPaths(admin, row, keep))]);
  if (!removed) return labResponse({ error: "Deney dosyaları silinemedi; kayıt korunuyor." }, 503);
  if (!(await deleteLabRunRow(admin, user.id, row.id))) return labResponse({ error: "Deney kaydı silinemedi." }, 503);
  return labResponse({ deleted: true, id: row.id }, 200);
}
