import { getAIProvider } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
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

  const rl = await rateLimit(`job-cancel:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("id, user_id, status, fal_request_id, model_id")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (job.status !== "pending" && job.status !== "processing") {
    return NextResponse.json(
      { error: "Only pending or processing jobs can be cancelled" },
      { status: 409 }
    );
  }

  if (job.fal_request_id) {
    try {
      await getAIProvider().cancel(job.model_id, job.fal_request_id);
    } catch {
      console.warn("[cancel-job] fal.ai cancel failed for", job.fal_request_id);
    }
  }

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("jobs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
