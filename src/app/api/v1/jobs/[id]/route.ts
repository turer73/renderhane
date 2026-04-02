import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-keys/middleware";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/v1/jobs/:id — Get job status and result.
 *
 * Headers:
 *   Authorization: Bearer rh_xxxxxxxxxxxx
 *
 * Returns:
 *   {
 *     "id": "uuid",
 *     "tool": "bg-remove",
 *     "status": "completed",          // pending | processing | completed | failed
 *     "creditCost": 1,
 *     "createdAt": "2024-01-01T...",
 *     "completedAt": "2024-01-01T...",
 *     "error": null,
 *     "output": {
 *       "url": "https://assets.renderhane.com/...",
 *       "thumbnailUrl": "https://..."
 *     }
 *   }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateApiRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const supabase = createAdminClient();

  // Get job — must belong to the API key owner
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id, tool, status, credit_cost, created_at, completed_at, error_message")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Get output if completed
  let output = null;
  if (job.status === "completed") {
    const { data: outputData } = await supabase
      .from("outputs")
      .select("r2_url, fal_url, thumbnail_url, metadata")
      .eq("job_id", id)
      .eq("user_id", auth.userId)
      .single();

    if (outputData) {
      let url = outputData.r2_url || outputData.fal_url;

      // Fallback: extract URL from metadata if fal_url/r2_url are null
      if (!url && outputData.metadata) {
        const m = outputData.metadata as Record<string, unknown>;
        const image = m.image as { url?: string } | undefined;
        const images = m.images as { url?: string }[] | undefined;
        const video = m.video as { url?: string } | undefined;
        url = image?.url || images?.[0]?.url || video?.url ||
              (typeof m.result_url === "string" ? m.result_url : null);
      }

      output = {
        url: url || null,
        thumbnailUrl: outputData.thumbnail_url || null,
      };
    }
  }

  return NextResponse.json({
    id: job.id,
    tool: job.tool,
    status: job.status,
    creditCost: job.credit_cost,
    createdAt: job.created_at,
    completedAt: job.completed_at,
    error: job.error_message || null,
    output,
  });
}
