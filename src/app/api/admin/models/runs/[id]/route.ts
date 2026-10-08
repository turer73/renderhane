import { isDeletableRun, isLabUuid } from "@/lib/admin/model-lab-flow";
import { labResponse, requireLabAdmin } from "@/lib/admin/model-lab-http";
import {
  deleteUnusedLabInputs,
  effectiveLabStatus,
  getLabRun,
  isLabInputPath,
  LAB_STORAGE_LEASE_MS,
  labRunDto,
  storageLeaseFree,
  storedPathsOf,
  tombstoneLabRun,
  updateLabRun,
  uploadPathsOf,
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
 * DELETE ?keep=<path>… — remove a finished run's stored outputs and any
 * lab-uploaded input no other run uses, then keep the row only as a
 * tombstone so its attempt id can never be paid for again. `keep` names
 * uploads still in the open form. An active or unknown run may still be
 * charging, and outputs being copied right now would be left behind, so
 * both are refused.
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
  if (!storageLeaseFree(row)) return labResponse({ error: "Çıktılar şu anda kalıcı depoya kopyalanıyor; biraz sonra silin." }, 409);
  // Hold the storage lease while files go, so no copy can start in between.
  const fenced = await updateLabRun(admin, user.id, row.id, {
    storage_lease_until: new Date(Date.now() + LAB_STORAGE_LEASE_MS).toISOString(),
  }, { whenStatus: [row.status], whenLease: row.storage_lease_until });
  if (!fenced) return labResponse({ error: "Deney bu sırada değişti; yeniden deneyin." }, 409);

  const prefix = labOutputPrefix(user.id, row.id);
  const outputPaths = row.outputs.flatMap((output) => (output.path?.startsWith(prefix) ? [output.path] : []));
  const inputs = uploadPathsOf(row.inputs).filter((path) => !keep.includes(path));
  const released = async (message: string) => {
    await updateLabRun(admin, user.id, row.id, { storage_lease_until: null }, { whenLease: fenced.storage_lease_until });
    return labResponse({ error: message }, 503);
  };
  if (!(await removeLabObjects(admin, outputPaths))) return released("Deney dosyaları silinemedi; kayıt korunuyor.");
  if (!(await deleteUnusedLabInputs(admin, user.id, inputs, { exceptRunId: row.id })).ok) {
    return released("Girdi dosyaları silinemedi; kayıt korunuyor.");
  }
  if (!(await tombstoneLabRun(admin, user.id, fenced))) return released("Deney kaydı silinemedi.");
  return labResponse({ deleted: true, id: row.id }, 200);
}
