import { createClient } from "@/lib/supabase/server";
import {
  cancelJobAndRefund,
  type JobCancellationDisposition,
} from "@/lib/jobs/webhook-transitions";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

const USER_CANCEL_REASON = "Cancelled by user";

function cancellationConflict(disposition: JobCancellationDisposition) {
  const error =
    disposition === "already_completed"
      ? "Job already completed"
      : disposition === "output_present"
        ? "Job already has an output"
        : "Job is not cancellable";

  return NextResponse.json({ error, disposition }, { status: 409 });
}

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
    .select("id, user_id, status, fal_request_id, model_id, original_request")
    .eq("id", id)
    .single();

  if (fetchErr || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isLegacyCancelled = job.status === "cancelled";
  if (
    job.status !== "pending" &&
    job.status !== "processing" &&
    !isLegacyCancelled
  ) {
    return NextResponse.json(
      { error: "Only pending or processing jobs can be cancelled" },
      { status: 409 }
    );
  }

  if (!isLegacyCancelled) {
    // Fal's cancellation acknowledgement is not a terminal lifecycle state:
    // an in-progress request can still complete, while a queued cancellation
    // may disappear without a signed terminal result. Until the provider
    // protocol supplies terminal evidence that can drive an atomic ledger
    // transition, active paid jobs must fail closed here. This performs no
    // provider call, status mutation, or credit mutation.
    return NextResponse.json(
      {
        error: "Active provider cancellation is temporarily unavailable",
        disposition: "not_cancellable",
      },
      { status: 409 }
    );
  }

  let disposition: JobCancellationDisposition;
  try {
    disposition = await cancelJobAndRefund({
      jobId: id,
      reason: USER_CANCEL_REASON,
      expectedProviderRequestId: null,
    });
  } catch (transitionError) {
    console.error(
      `[cancel-job] Legacy cancellation repair failed for ${id}:`,
      transitionError
    );
    return NextResponse.json(
      { error: "Cancellation could not be finalized" },
      { status: 503, headers: { "Retry-After": "5" } }
    );
  }

  if (
    disposition === "cancelled_refunded" ||
    disposition === "already_cancelled_refunded" ||
    disposition === "cancelled_no_charge"
  ) {
    return NextResponse.json({ ok: true, disposition });
  }
  return cancellationConflict(disposition);
}
