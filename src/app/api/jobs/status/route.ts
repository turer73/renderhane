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
      "id, tool, status, credit_cost, created_at, completed_at, error_message, outputs(id, r2_url, fal_url, type)"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }

  // Flatten: attach output_url to each job for easy client access
  const enrichedJobs = (jobs ?? []).map((job) => {
    const output = Array.isArray(job.outputs) ? job.outputs[0] : null;
    return {
      id: job.id,
      tool: job.tool,
      status: job.status,
      credit_cost: job.credit_cost,
      created_at: job.created_at,
      completed_at: job.completed_at,
      error_message: job.error_message,
      output_id: output?.id || null,
      output_url: output?.r2_url || output?.fal_url || null,
      output_type: output?.type || null,
    };
  });

  return NextResponse.json({ jobs: enrichedJobs });
}
