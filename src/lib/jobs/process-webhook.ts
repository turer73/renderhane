import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2 } from "@/lib/r2/upload";
import { extractOutputUrl } from "@/lib/jobs/output-url";
import {
  completeJobOutputAndSpend,
  failJobAndRefund,
} from "@/lib/jobs/webhook-transitions";

export async function processWebhookEvent(params: {
  jobId: string;
  txId: string | null;
  body: Record<string, unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const { jobId, body } = params;
  const status = body.status as string | undefined;
  const payload = body.payload as Record<string, unknown> | undefined;

  if (status === "OK" && payload) {
    const outputUrl = extractOutputUrl(payload);

    if (!outputUrl) {
      console.error(`[process-webhook] extractOutputUrl returned null for job ${jobId}`);
      await failJobAndRefund({
        jobId,
        errorMessage: "Output could not be extracted from AI response",
      });
      return { ok: true };
    }

    const completion = await completeJobOutputAndSpend({
      jobId,
      falUrl: outputUrl,
      metadata: payload,
    });

    if (
      completion.disposition === "terminal_conflict" ||
      completion.disposition === "payload_conflict"
    ) {
      console.error(
        `[process-webhook] Ignored ${completion.disposition} for job ${jobId}`
      );
      return { ok: true };
    }

    if (!completion.outputId || !completion.outputType || completion.r2Url) {
      return { ok: true };
    }

    const supabase = createAdminClient();
    let r2Success = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
        const r2Result = await uploadToR2(
          outputUrl,
          completion.userId,
          completion.outputType
        );

        const { error: outputUpdateError } = await supabase
          .from("outputs")
          .update({
            r2_url: r2Result.r2Url,
            file_size: r2Result.fileSize,
          })
          .eq("id", completion.outputId);
        if (outputUpdateError) throw outputUpdateError;

        if (completion.projectId) {
          const { error: projectUpdateError } = await supabase
            .from("projects")
            .update({ thumbnail_url: r2Result.r2Url })
            .eq("id", completion.projectId)
            .eq("user_id", completion.userId);
          if (projectUpdateError) throw projectUpdateError;
        }

        r2Success = true;
        break;
      } catch (error) {
        console.error(
          `[process-webhook] R2 upload attempt ${attempt + 1}/3 failed for job ${jobId}:`,
          error
        );
      }
    }

    if (!r2Success) {
      console.error(`[process-webhook] All R2 upload attempts failed for job ${jobId}`);
      if (completion.projectId) {
        const { error: fallbackThumbnailError } = await supabase
          .from("projects")
          .update({ thumbnail_url: outputUrl })
          .eq("id", completion.projectId)
          .eq("user_id", completion.userId);
        if (fallbackThumbnailError) {
          console.error(
            `[process-webhook] Fallback thumbnail update failed for ${jobId}:`,
            fallbackThumbnailError
          );
        }
      }
    }
  } else {
    const errorMsg =
      (payload?.detail as string) || (payload?.message as string) || "Unknown error";

    await failJobAndRefund({ jobId, errorMessage: errorMsg });
  }

  return { ok: true };
}
