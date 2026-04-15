import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * DELETE /api/jobs/:id
 * Soft-deletes a job by setting status to 'cancelled'.
 * Only the job owner can delete. Only completed/failed jobs can be removed.
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

  if (job.status === "cancelled") {
    return NextResponse.json({ ok: true }); // already deleted — idempotent
  }

  // Soft delete
  const { error: updateErr } = await supabase
    .from("jobs")
    .update({ status: "cancelled" })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
