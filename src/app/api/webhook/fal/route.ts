import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { confirmSpend, refundCredits } from "@/lib/credits/engine";
import { uploadToR2 } from "@/lib/r2/upload";
import { NextRequest, NextResponse } from "next/server";

// Video files can be 8-50MB — downloading from fal.ai + uploading to R2
// needs more than the default Vercel timeout (10s hobby / 60s pro)
export const maxDuration = 120;

/**
 * Verify the HMAC signature from the webhook URL.
 * Uses timing-safe comparison to prevent timing attacks.
 */
function verifySignature(jobId: string, txId: string | null, signature: string): boolean {
  const secret = process.env.FAL_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const payload = `${jobId}:${txId || ""}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (sigBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expectedBuf);
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const txId = searchParams.get("txId");
  const signature = searchParams.get("sig");

  // Verify webhook HMAC signature (timing-safe)
  if (!jobId || !signature || !verifySignature(jobId, txId, signature)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  let body: { status?: string; payload?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
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

      // Mark as failed instead of silently completing with no output
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error_message: "Output could not be extracted from AI response",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (txId) {
        await refundCredits(txId);
      }

      return NextResponse.json({ received: true });
    }

    // Query job data for output record
    const { data: job } = await supabase
      .from("jobs")
      .select("user_id, project_id, tool")
      .eq("id", jobId)
      .single();

    if (job) {
      const outputType = getOutputType(job.tool);

      // STEP 1: Create output record with fal_url IMMEDIATELY.
      // This ensures the user can download even if R2 upload times out.
      // fal.ai URLs are temporary (~24h) but better than nothing.
      // Use upsert to prevent duplicate records on webhook retry.
      const { data: outputRecord, error: outputError } = await supabase
        .from("outputs")
        .upsert(
          {
            job_id: jobId,
            user_id: job.user_id,
            project_id: job.project_id,
            type: outputType,
            fal_url: outputUrl,
            r2_url: null,
            file_size: null,
            metadata: payload,
          },
          { onConflict: "job_id" }
        )
        .select("id")
        .single();

      if (outputError) {
        console.error(
          `[webhook] Output UPSERT failed for job ${jobId}:`,
          outputError.message, outputError.code, outputError.details
        );
      }

      // STEP 2: Mark job as completed + confirm credits BEFORE R2 upload.
      // This way the user sees "completed" immediately.
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (txId) {
        await confirmSpend(txId, jobId);
      }

      // STEP 3: Upload to R2 for permanent storage (slow for video).
      // If this times out, the fal_url is still available in the output record.
      // Retry up to 2 times with backoff — fal.ai URLs expire in ~24h.
      if (outputUrl && outputRecord) {
        let r2Success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise((r) => setTimeout(r, attempt * 2000));
            }
            const r2Result = await uploadToR2(outputUrl, job.user_id, outputType);

            // Update output record with permanent R2 URL
            await supabase
              .from("outputs")
              .update({
                r2_url: r2Result.r2Url,
                file_size: r2Result.fileSize,
              })
              .eq("id", outputRecord.id);

            // Update project thumbnail with permanent URL
            if (job.project_id) {
              await supabase
                .from("projects")
                .update({ thumbnail_url: r2Result.r2Url })
                .eq("id", job.project_id);
            }

            r2Success = true;
            break;
          } catch (err) {
            console.error(`[webhook] R2 upload attempt ${attempt + 1}/3 failed for job ${jobId}:`, err);
          }
        }

        if (!r2Success) {
          console.error(`[webhook] All R2 upload attempts failed for job ${jobId} — fal_url still available`);
          // Fallback: use fal_url as project thumbnail
          if (job.project_id && outputUrl) {
            await supabase
              .from("projects")
              .update({ thumbnail_url: outputUrl })
              .eq("id", job.project_id);
          }
        }
      }
    } else {
      // Job data not found — still mark completed to avoid stuck state
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (txId) {
        await confirmSpend(txId, jobId);
      }
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

  // Last resort: recursively find any HTTP URL in nested arrays/objects
  const jsonStr = JSON.stringify(payload);
  const urlMatch = jsonStr.match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
  if (urlMatch) return urlMatch[1];

  return null;
}

function getOutputType(tool: string): "glb" | "image" | "video" {
  if (tool === "3d-model") return "glb";
  if (tool === "video" || tool === "talking-avatar") return "video";
  return "image";
}
