import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type WebhookCompletionDisposition =
  | "completed"
  | "replayed"
  | "repaired"
  | "terminal_conflict"
  | "payload_conflict";

export interface WebhookCompletion {
  disposition: WebhookCompletionDisposition;
  outputId: string | null;
  userId: string;
  projectId: string | null;
  outputType: "glb" | "image" | "video" | null;
  r2Url: string | null;
}

interface CompletionRow {
  disposition: WebhookCompletionDisposition;
  output_id: string | null;
  result_user_id: string;
  result_project_id: string | null;
  result_output_type: "glb" | "image" | "video" | null;
  result_r2_url: string | null;
}

export async function completeJobOutputAndSpend(input: {
  jobId: string;
  falUrl: string;
  metadata: Record<string, unknown>;
}): Promise<WebhookCompletion> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc(
    "complete_job_output_and_spend",
    {
      p_job_id: input.jobId,
      p_fal_url: input.falUrl,
      p_metadata: input.metadata,
    }
  );

  if (error) {
    throw new Error(`Failed to complete webhook job: ${error.message}`);
  }

  const row = Array.isArray(data) ? (data[0] as CompletionRow | undefined) : undefined;
  if (!row?.disposition || !row.result_user_id) {
    throw new Error("Failed to complete webhook job: invalid database response");
  }

  return {
    disposition: row.disposition,
    outputId: row.output_id,
    userId: row.result_user_id,
    projectId: row.result_project_id,
    outputType: row.result_output_type,
    r2Url: row.result_r2_url,
  };
}

export type JobFailureDisposition =
  | "failed_refunded"
  | "already_failed_refunded"
  | "failed_no_charge"
  | "already_completed"
  | "not_eligible"
  | "output_present"
  | "output_repaired";

export async function failJobAndRefund(input: {
  jobId: string;
  errorMessage: string;
  staleBefore?: string;
}): Promise<JobFailureDisposition> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("fail_job_and_refund", {
    p_job_id: input.jobId,
    p_error_message: input.errorMessage,
    p_stale_before: input.staleBefore ?? null,
  });

  if (error) {
    throw new Error(`Failed to fail/refund webhook job: ${error.message}`);
  }

  if (
    data !== "failed_refunded" &&
    data !== "already_failed_refunded" &&
    data !== "failed_no_charge" &&
    data !== "already_completed" &&
    data !== "not_eligible" &&
    data !== "output_present" &&
    data !== "output_repaired"
  ) {
    throw new Error("Failed to fail/refund webhook job: invalid database response");
  }

  return data;
}

export type JobCancellationDisposition =
  | "cancelled_refunded"
  | "already_cancelled_refunded"
  | "cancelled_no_charge"
  | "already_completed"
  | "not_cancellable"
  | "output_present";

const JOB_CANCELLATION_DISPOSITIONS = new Set<JobCancellationDisposition>([
  "cancelled_refunded",
  "already_cancelled_refunded",
  "cancelled_no_charge",
  "already_completed",
  "not_cancellable",
  "output_present",
]);

/**
 * Atomically transitions a cancellable job and its credit reservation.
 *
 * This helper is only for repairing a legacy row that is already terminal
 * `cancelled`. Active provider cancellation is intentionally disabled until
 * the provider exposes terminal evidence that can safely drive the ledger.
 */
export async function cancelJobAndRefund(input: {
  jobId: string;
  reason: string;
  expectedProviderRequestId: string | null;
}): Promise<JobCancellationDisposition> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("cancel_job_and_refund", {
    p_job_id: input.jobId,
    p_reason: input.reason,
    p_expected_fal_request_id: input.expectedProviderRequestId,
  });

  if (error) {
    throw new Error(`Failed to cancel/refund job: ${error.message}`);
  }

  if (!JOB_CANCELLATION_DISPOSITIONS.has(data as JobCancellationDisposition)) {
    throw new Error("Failed to cancel/refund job: invalid database response");
  }

  return data as JobCancellationDisposition;
}
