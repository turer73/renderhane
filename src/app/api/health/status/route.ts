import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Public health status endpoint for the client.
 * Returns only a boolean — no sensitive info exposed.
 *
 * Called by PhotoUpload before allowing job submission.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    const { data } = await supabase
      .from("system_status")
      .select("is_healthy")
      .eq("id", "fal-ai")
      .single();

    return NextResponse.json({
      healthy: data?.is_healthy ?? true,
    });
  } catch {
    // If the health check system itself fails, don't block users.
    // Assume healthy and let job-level errors handle it.
    return NextResponse.json({ healthy: true });
  }
}
