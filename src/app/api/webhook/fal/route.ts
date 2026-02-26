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

  if (!jobId || !txId) {
    return NextResponse.json(
      { error: "Missing jobId or txId" },
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
    // Job succeeded
    const outputUrl = extractOutputUrl(payload);

    // Update job status
    await supabase
      .from("jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    // Create output record + upload to R2 for permanent storage
    if (outputUrl) {
      const { data: job } = await supabase
        .from("jobs")
        .select("user_id, project_id, tool")
        .eq("id", jobId)
        .single();

      if (job) {
        const outputType = getOutputType(job.tool);

        // Upload to R2 (non-blocking — output record is created regardless)
        let r2Url: string | null = null;
        let fileSize: number | null = null;
        try {
          const r2Result = await uploadToR2(outputUrl, job.user_id, outputType);
          r2Url = r2Result.r2Url;
          fileSize = r2Result.fileSize;
        } catch (err) {
          console.error("R2 upload failed (fal_url still available):", err);
        }

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
      }
    }

    // Confirm credit spend
    await confirmSpend(txId, jobId);
  } else {
    // Job failed — refund credits
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

    await refundCredits(txId);
  }

  return NextResponse.json({ received: true });
}

function extractOutputUrl(payload: Record<string, unknown>): string | null {
  // 3D models
  const modelMesh = payload.model_mesh as
    | { url?: string }
    | undefined;
  if (modelMesh?.url) return modelMesh.url;

  const modelGlb = payload.model_glb as { url?: string } | undefined;
  if (modelGlb?.url) return modelGlb.url;

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

  return null;
}

function getOutputType(tool: string): "glb" | "image" | "video" {
  if (tool === "3d-model") return "glb";
  if (tool === "video") return "video";
  return "image";
}
