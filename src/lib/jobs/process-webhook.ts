import { createAdminClient } from "@/lib/supabase/admin";
import { confirmSpend, refundCredits } from "@/lib/credits/engine";
import { uploadToR2 } from "@/lib/r2/upload";

function extractOutputUrl(payload: Record<string, unknown>): string | null {
  const modelMesh = payload.model_mesh as { url?: string } | undefined;
  if (modelMesh?.url) return modelMesh.url;

  const modelGlb = payload.model_glb as { url?: string } | undefined;
  if (modelGlb?.url) return modelGlb.url;

  const glb = payload.glb as { url?: string } | undefined;
  if (glb?.url) return glb.url;
  const mesh = payload.mesh as { url?: string } | undefined;
  if (mesh?.url) return mesh.url;

  const video = payload.video as { url?: string } | undefined;
  if (video?.url) return video.url;

  const image = payload.image as { url?: string } | undefined;
  if (image?.url) return image.url;

  if (typeof payload.result_url === "string") return payload.result_url;

  const images = payload.images as { url?: string }[] | undefined;
  if (images?.[0]?.url) return images[0].url;

  const output = payload.output as { url?: string } | undefined;
  if (output?.url) return output.url;

  for (const value of Object.values(payload)) {
    if (typeof value === "object" && value !== null && "url" in value) {
      const url = (value as { url?: string }).url;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }

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

export async function processWebhookEvent(params: {
  jobId: string;
  txId: string | null;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const { jobId, txId, body } = params;
  const status = body.status as string | undefined;
  const payload = body.payload as Record<string, unknown> | undefined;

  const supabase = createAdminClient();

  const { data: existingJob } = await supabase
    .from("jobs")
    .select("status")
    .eq("id", jobId)
    .single();

  if (existingJob?.status === "completed" || existingJob?.status === "failed") {
    return { ok: true };
  }

  if (status === "OK" && payload) {
    const outputUrl = extractOutputUrl(payload);

    if (!outputUrl) {
      console.error(`[process-webhook] extractOutputUrl returned null for job ${jobId}`);
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error_message: "Output could not be extracted from AI response",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (txId) await refundCredits(txId);
      return { ok: true };
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("user_id, project_id, tool")
      .eq("id", jobId)
      .single();

    if (job) {
      const outputType = getOutputType(job.tool);

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
        console.error(`[process-webhook] Output UPSERT failed for job ${jobId}:`, outputError);
      }

      await supabase
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (txId) await confirmSpend(txId, jobId);

      if (outputUrl && outputRecord) {
        let r2Success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            if (attempt > 0) {
              await new Promise((r) => setTimeout(r, attempt * 2000));
            }
            const r2Result = await uploadToR2(outputUrl, job.user_id, outputType);

            await supabase
              .from("outputs")
              .update({
                r2_url: r2Result.r2Url,
                file_size: r2Result.fileSize,
              })
              .eq("id", outputRecord.id);

            if (job.project_id) {
              await supabase
                .from("projects")
                .update({ thumbnail_url: r2Result.r2Url })
                .eq("id", job.project_id);
            }

            r2Success = true;
            break;
          } catch (err) {
            console.error(`[process-webhook] R2 upload attempt ${attempt + 1}/3 failed for job ${jobId}:`, err);
          }
        }

        if (!r2Success) {
          console.error(`[process-webhook] All R2 upload attempts failed for job ${jobId}`);
          if (job.project_id && outputUrl) {
            await supabase
              .from("projects")
              .update({ thumbnail_url: outputUrl })
              .eq("id", job.project_id);
          }
        }
      }
    } else {
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);

      if (txId) await confirmSpend(txId, jobId);
    }
  } else {
    const errorMsg =
      (payload?.detail as string) || (payload?.message as string) || "Unknown error";

    await supabase
      .from("jobs")
      .update({
        status: "failed",
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    if (txId) await refundCredits(txId);
  }

  return { ok: true };
}
