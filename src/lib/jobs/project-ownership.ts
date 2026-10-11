import type { SupabaseClient } from "@supabase/supabase-js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProjectCheck = "ok" | "invalid" | "not_found" | "unavailable";

/**
 * Jobs are inserted with the admin client, so RLS does not stop a request from
 * naming someone else's project. The completion and refund RPCs then reject
 * the job (job_project_owner_mismatch) and its credits stay reserved, so a
 * client-supplied project must be checked with the caller's own client first.
 */
export async function checkProjectOwnership(
  supabase: SupabaseClient,
  projectId: unknown,
  userId: string
): Promise<ProjectCheck> {
  if (typeof projectId !== "string" || !UUID.test(projectId)) return "invalid";
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return "unavailable";
  return data ? "ok" : "not_found";
}

export function projectCheckResponse(check: Exclude<ProjectCheck, "ok">): { body: { error: string }; status: number } {
  if (check === "unavailable") return { body: { error: "Project verification unavailable" }, status: 503 };
  if (check === "invalid") return { body: { error: "projectId must be a UUID" }, status: 400 };
  return { body: { error: "Project not found" }, status: 404 };
}
