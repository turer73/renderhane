import { getAIProvider } from "@/lib/ai";
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
    .select("id, tool, model_id, status, credit_cost, created_at, completed_at, error_message, fal_request_id")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Get output if completed — job ownership already verified above
  let output = null;
  if (job.status === "completed") {
    const { data: outputData } = await supabase
      .from("outputs")
      .select("r2_url, fal_url, thumbnail_url, metadata")
      .eq("job_id", id)
      .limit(1)
      .maybeSingle();

    if (outputData) {
      let url = outputData.r2_url || outputData.fal_url;

      // Fallback: extract URL from metadata if fal_url/r2_url are null
      if (!url && outputData.metadata) {
        url = extractUrlFromPayload(outputData.metadata as Record<string, unknown>);
      }

      output = {
        url: url || null,
        thumbnailUrl: outputData.thumbnail_url || null,
      };
    }

    // Self-healing: if no output record exists but job completed,
    // try to recover the result from fal.ai using the request ID
    if (!output && job.fal_request_id && job.model_id) {
      try {
        const falResult = await getAIProvider().result<Record<string, unknown>>(
          job.model_id,
          job.fal_request_id
        );
        const payload = falResult;
        const url = extractUrlFromPayload(payload);

        if (url) {
          output = { url, thumbnailUrl: null };

          // Backfill the missing output record for future requests
          await supabase.from("outputs").insert({
            job_id: id,
            user_id: auth.userId,
            type: job.tool === "3d-model" ? "glb" : job.tool === "video" ? "video" : "image",
            fal_url: url,
            metadata: payload,
          });
        }
      } catch (err) {
        console.error(`[v1/jobs] Self-healing fal.queue.result failed for ${id}:`, err);
      }
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

/** Extract the primary output URL from a fal.ai result payload. */
function extractUrlFromPayload(payload: Record<string, unknown>): string | null {
  const image = payload.image as { url?: string } | undefined;
  if (image?.url) return image.url;

  const images = payload.images as { url?: string }[] | undefined;
  if (images?.[0]?.url) return images[0].url;

  const video = payload.video as { url?: string } | undefined;
  if (video?.url) return video.url;

  if (typeof payload.result_url === "string") return payload.result_url;

  const modelMesh = payload.model_mesh as { url?: string } | undefined;
  if (modelMesh?.url) return modelMesh.url;

  const output = payload.output as { url?: string } | undefined;
  if (output?.url) return output.url;

  // Deep URL search
  for (const value of Object.values(payload)) {
    if (typeof value === "object" && value !== null && "url" in value) {
      const url = (value as { url?: string }).url;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  return null;
}
