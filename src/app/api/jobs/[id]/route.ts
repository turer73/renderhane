import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteFromR2 } from "@/lib/r2/upload";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/jobs/:id
 * Hard-deletes a job: removes R2 output file, output record, then job record.
 * Only the job owner can delete. Only completed/failed/cancelled jobs can be removed.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch job — verify ownership
  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("id, user_id, status")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only allow deleting finished jobs
  if (job.status === "pending" || job.status === "processing") {
    return NextResponse.json(
      { error: "Cannot delete a job that is still in progress" },
      { status: 409 }
    );
  }

  const admin = createAdminClient();

  // 1. Find output and delete R2 file (if exists)
  const { data: output } = await admin
    .from("outputs")
    .select("id, r2_url")
    .eq("job_id", id)
    .maybeSingle();

  if (output?.r2_url) {
    try {
      await deleteFromR2(output.r2_url);
    } catch (err) {
      // Log but don't block deletion — orphaned R2 files are cheaper than stuck jobs
      console.error("[delete-job] R2 cleanup failed:", err);
    }
  }

  // 2. Delete output record
  if (output) {
    await admin.from("outputs").delete().eq("id", output.id);
  }

  // 3. Delete job record
  const { error: deleteErr } = await admin
    .from("jobs")
    .delete()
    .eq("id", id);

  if (deleteErr) {
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
