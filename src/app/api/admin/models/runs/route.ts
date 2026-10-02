import {
  deleteLabRunRow,
  expiredLabRuns,
  LAB_HISTORY_PAGE,
  labRunDto,
  listLabRuns,
  staleUnusedLabInputs,
  storedPathsOf,
  unsharedUploadPaths,
} from "@/lib/admin/model-lab-runs";
import { labResponse, requireLabAdmin } from "@/lib/admin/model-lab-http";
import { removeLabObjects, signLabPaths } from "@/lib/admin/model-lab-storage";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import type { NextRequest } from "next/server";

/**
 * Kept for this many days; expired runs, their stored files and uploads no
 * run uses are removed when history is read.
 */
export const LAB_RETENTION_DAYS = 30;
const RETENTION_MS = LAB_RETENTION_DAYS * 24 * 60 * 60 * 1000;

type AdminClient = ReturnType<typeof createAdminClient>;

async function purgeExpired(admin: AdminClient, userId: string): Promise<void> {
  const now = new Date();
  for (const row of await expiredLabRuns(admin, userId, now)) {
    // A 30-day-old run is no longer charging; files go first, then the row.
    const paths = [
      ...row.outputs.flatMap((output) => (output.path ? [output.path] : [])),
      ...(await unsharedUploadPaths(admin, row)),
    ];
    if (await removeLabObjects(admin, paths)) await deleteLabRunRow(admin, userId, row.id);
  }
  // Uploads from abandoned forms: never used by a run and older than retention.
  await removeLabObjects(admin, await staleUnusedLabInputs(admin, userId, now, RETENTION_MS));
}

/** GET /api/admin/models/runs?before=<ISO time> — the admin's own history, newest first. */
export async function GET(request: NextRequest) {
  const user = await requireLabAdmin(request, { sameOrigin: false });
  if (user instanceof Response) return user;
  const before = request.nextUrl.searchParams.get("before");
  if (before !== null && Number.isNaN(Date.parse(before))) return labResponse({ error: "Geçersiz sayfa imleci." }, 400);
  const limited = await rateLimit(`labhistory:${user.id}`, RATE_LIMITS.general);
  if (!limited.success) return labResponse({ error: "Çok fazla geçmiş isteği gönderildi. Lütfen bekleyin." }, 429);

  const admin = createAdminClient();
  await purgeExpired(admin, user.id);
  const rows = await listLabRuns(admin, user.id, { before: before ?? undefined });
  if (!rows) return labResponse({ error: "Deney geçmişi şu anda okunamadı." }, 503);
  const links = await signLabPaths(admin, rows.flatMap(storedPathsOf));
  return labResponse({
    runs: rows.map((row) => labRunDto(row, links)),
    nextBefore: rows.length === LAB_HISTORY_PAGE ? rows[rows.length - 1].created_at : null,
    retentionDays: LAB_RETENTION_DAYS,
  }, 200);
}
