import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Public health status endpoint for the client.
 * Returns only a boolean — no sensitive info exposed.
 *
 * Called by PhotoUpload before allowing job submission.
 * Cached for 30s to reduce Supabase calls during traffic spikes.
 */
export async function GET() {
  try {
    const supabase = createAdminClient();

    // Race against a 5s timeout to prevent hanging on slow Supabase
    const query = supabase
      .from("system_status")
      .select("is_healthy")
      .eq("id", "fal-ai")
      .single();

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 5000)
    );

    const result = await Promise.race([query, timeoutPromise]);
    const data = result && "data" in result ? result.data : null;

    return NextResponse.json(
      { healthy: data?.is_healthy ?? true },
      {
        headers: {
          // Cache 30s at CDN edge — reduces cold starts for repeated checks
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    // If the health check system itself fails, don't block users.
    // Assume healthy and let job-level errors handle it.
    return NextResponse.json({ healthy: true });
  }
}
