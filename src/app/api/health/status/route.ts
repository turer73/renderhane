import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

/**
 * Public health status endpoint for the client.
 * Returns only a boolean — no sensitive info exposed.
 *
 * Confirmed provider status is cached for 30s. An unavailable check returns
 * 503 without caching, rather than claiming that the provider is healthy.
 */
export async function GET() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const supabase = createAdminClient();

    // Race against a 5s timeout to prevent hanging on slow Supabase
    const query = supabase
      .from("system_status")
      .select("is_healthy")
      .eq("id", "fal-ai")
      .single();

    const timeoutPromise = new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), 5000);
    });

    const result = await Promise.race([query, timeoutPromise]);
    if (!result || result.error || typeof result.data?.is_healthy !== "boolean") {
      return unavailable();
    }

    return NextResponse.json(
      { healthy: result.data.is_healthy },
      {
        headers: {
          // Cache 30s at CDN edge — reduces cold starts for repeated checks
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch {
    return unavailable();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function unavailable() {
  return NextResponse.json(
    { healthy: false },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
}
