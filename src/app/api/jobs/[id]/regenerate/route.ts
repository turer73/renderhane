import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { buildRegenerationInput, RegenerationInputError } from "@/lib/jobs/regenerate-input";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

/**
 * POST /api/jobs/:id/regenerate
 * Re-submits a job using the stored original_request (pre-processing params).
 * Falls back to extracting from input_params for legacy jobs without original_request.
 */
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

  // Rate limit
  const rl = await rateLimit(`job-submit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  // Fetch original job (include original_request + input_params for fallback)
  const { data: job, error: fetchErr } = await supabase
    .from("jobs")
    .select("id, user_id, project_id, tool, model_id, original_request, input_params")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // srt-voiceover orijinal isteği (SRT + ses) bu hattın prompt/image kalıbına
  // uymaz — sessiz fal 422 yerine açık hata dön, kullanıcı Seslendir sekmesine gitsin.
  if (job.tool === "srt-voiceover") {
    return NextResponse.json(
      { error: "Regenerate is not supported for SRT voiceover — use the Seslendir tab." },
      { status: 400 }
    );
  }
  try {
    const replay = buildRegenerationInput(job);
    if (replay.projectId) {
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("id")
        .eq("id", replay.projectId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (projectError) return NextResponse.json({ error: "Project verification unavailable" }, { status: 503 });
      if (!project) return NextResponse.json({ error: "Original project is unavailable" }, { status: 409 });
    }
    const result = await submitJob({
      ...replay,
      userId: user.id,
      userEmail: user.email,
    });

    const reconciliationPending = result.submissionState !== "accepted";
    return NextResponse.json(
      {
        jobId: result.jobId,
        requestId: result.requestId,
        creditCost: result.creditCost,
        submissionState: result.submissionState,
        ...(result.warning ? { warning: result.warning } : {}),
      },
      {
        status: reconciliationPending ? 202 : 200,
        ...(reconciliationPending
          ? { headers: { "Retry-After": "30" } }
          : {}),
      }
    );
  } catch (err) {
    if (err instanceof RegenerationInputError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    if (err instanceof CreditError && err.code === "INSUFFICIENT") {
      return NextResponse.json({ error: "Yetersiz kredi" }, { status: 402 });
    }
    const message =
      err instanceof Error ? err.message : "Yeniden uretim basarisiz";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
