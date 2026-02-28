import { createAdminClient } from "@/lib/supabase/admin";
import { confirmSpend, refundCredits } from "@/lib/credits/engine";
import { uploadToR2 } from "@/lib/r2/upload";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const txId = searchParams.get("txId");
  const secret = searchParams.get("secret");

  // Verify webhook secret
  if (!secret || secret !== process.env.FAL_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!jobId) {
    return NextResponse.json(
      { error: "Missing jobId" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const { status, payload } = body;

  const supabase = createAdminClient();

  // Idempotency check: skip if job is already in a terminal state
  const { data: existingJob } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  if (existingJob?.status === "completed" || existingJob?.status === "failed") {
    return NextResponse.json({ received: true });
  }

  if (status === "OK" && payload) {
    // ── Job succeeded ──────────────────────────────────────
    // IMPORTANT: We create the output record FIRST, then mark
    // the job as "completed". This prevents the race condition
    // where the client sees completed status but no output yet.

    const outputUrl = extractOutputUrl(payload);

    if (!outputUrl) {
      console.error(
        `[webhook] extractOutputUrl returned null for job ${jobId}. Payload keys:`,
        Object.keys(payload)
      );
    }

    // Query job data for output record
    const { data: job } = await supabase
      .from("jobs")
      .select("user_id, project_id, tool")
      .eq("id", jobId)
      .single();

    if (job) {
      const outputType = getOutputType(job.tool);

      // Upload to R2 for permanent storage (only if URL was found)
      let r2Url: string | null = null;
      let fileSize: number | null = null;
      if (outputUrl) {
        try {
          const r2Result = await uploadToR2(outputUrl, job.user_id, outputType);
          r2Url = r2Result.r2Url;
          fileSize = r2Result.fileSize;
        } catch (err) {
          console.error("R2 upload failed (fal_url still available):", err);
        }
      }

      // Always create output record (even if URL extraction failed,
      // we store metadata for debugging)
      await supabase.from("outputs").insert({
        job_id: jobId,
        user_id: job.user_id,
        project_id: job.project_id,
        type: outputType,
        fal_url: outputUrl,
        r2_url: r2Url,
        file_size: fileSize,
        metadata: payload,
      });

      // Update project thumbnail with the permanent R2 URL
      const permanentUrl = r2Url || outputUrl;
      if (job.project_id && permanentUrl) {
        await supabase
          .from("projects")
          .update({ thumbnail_url: permanentUrl })
          .eq("id", job.project_id);
      }
    }

    // NOW mark job as completed — output record already exists
    await supabase
      .from("jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Confirm credit spend (only if credits were reserved)
    if (txId) {
      await confirmSpend(txId, jobId);
    }
  } else {
    // ── Job failed — refund credits ──────────────────────
    const errorMsg =
      payload?.detail || payload?.message || "Unknown error";

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (txId) {
      await refundCredits(txId);
    }
  }

  return NextResponse.json({ received: true });
}

/**
 * Extract the primary output URL from the fal.ai webhook payload.
 * Checks known response patterns from all supported models,
 * then falls back to a deep URL search.
 */
function extractOutputUrl(payload: Record<string, unknown>): string | null {
  // 3D models — TRELLIS v1
  const modelMesh = payload.model_mesh as
    | { url?: string }
    | undefined;
  if (modelMesh?.url) return modelMesh.url;

  // 3D models — TRELLIS 2
  const modelGlb = payload.model_glb as { url?: string } | undefined;
  if (modelGlb?.url) return modelGlb.url;

  // 3D models — generic fallbacks
  const glb = payload.glb as { url?: string } | undefined;
  if (glb?.url) return glb.url;
  const mesh = payload.mesh as { url?: string } | undefined;
  if (mesh?.url) return mesh.url;

  // Videos (e.g. Wan image-to-video)
  const video = payload.video as { url?: string } | undefined;
  if (video?.url) return video.url;

  // Images
  const image = payload.image as { url?: string } | undefined;
  if (image?.url) return image.url;

  // Bria product-shot returns result_url at top level
  if (typeof payload.result_url === "string") return payload.result_url;

  // Arrays
  const images = payload.images as { url?: string }[] | undefined;
  if (images?.[0]?.url) return images[0].url;

  // Generic output wrapper
  const output = payload.output as { url?: string } | undefined;
  if (output?.url) return output.url;

  // Deep URL search: look for any object with a 'url' string field
  for (const value of Object.values(payload)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "url" in value
    ) {
      const url = (value as { url?: string }).url;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

  return null;
}

function getOutputType(tool: string): "glb" | "image" | "video" {
  if (tool === "3d-model") return "glb";
  if (tool === "video") return "video";
  return "image";
}
