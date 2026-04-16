import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, tool, model_id, status, credit_cost, created_at, completed_at, error_message, input_params, outputs(id, r2_url, fal_url, type)"
    )
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }

  // Flatten: attach output_url + source_image to each job for easy client access.
  // outputs is a single object (one-to-one via unique job_id) or array (legacy).
  const enrichedJobs = (jobs ?? []).map((job) => {
    const raw = job.outputs;
    const output = Array.isArray(raw) ? raw[0] : raw ?? null;

    // Extract source image from input_params for thumbnail display
    // (output_url may be a .glb which can't be shown as <img>)
    const params = (job.input_params as Record<string, unknown>) ?? {};
    const sourceImage =
      (params.image_url as string) ??
      (params.image_urls as string[])?.[0] ??
      (params.input_image_url as string) ??
      (params.front_image_url as string) ??
      (params.model_image as string) ??
      (params.start_image_url as string) ??
      null;

    return {
      id: job.id,
      tool: job.tool,
      model_id: job.model_id,
      status: job.status,
      credit_cost: job.credit_cost,
      created_at: job.created_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
      output_id: output?.id || null,
      output_url: output?.r2_url || output?.fal_url || null,
      output_type: output?.type || null,
      source_image: sourceImage,
    };
  });

  return NextResponse.json({ jobs: enrichedJobs });
}
