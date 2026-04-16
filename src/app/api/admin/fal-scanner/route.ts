import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin-check";
import { runScan } from "@/lib/fal/scanner";

// Scanner can take 30-60s to check all endpoints + scrape category pages
export const maxDuration = 120;

/**
 * GET /api/admin/fal-scanner
 * Fetch the latest scan results from the database.
 * Requires admin session.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { searchParams } = request.nextUrl;
  const limit = Math.min(10, Math.max(1, Number(searchParams.get("limit")) || 5));

  const { data, error } = await admin
    .from("fal_scan_results")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("[fal-scanner] Fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scan results" },
      { status: 500 }
    );
  }

  return NextResponse.json({ scans: data });
}

/**
 * POST /api/admin/fal-scanner
 * Trigger a new scan manually. Requires admin session.
 *
 * Also called by Vercel Cron via /api/cron/fal-scanner (separate route).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await runScan();
    const admin = createAdminClient();

    // Store scan result
    const { error: insertError } = await admin.from("fal_scan_results").insert({
      scanned_at: result.scannedAt,
      total_models_checked: result.totalModelsChecked,
      active_count: result.activeCount,
      error_count: result.errorCount,
      new_models_found: result.newModelsFound,
      endpoint_checks: result.endpointChecks,
      new_models: result.newModels,
      alerts: result.alerts,
    });

    if (insertError) {
      console.error("[fal-scanner] Insert error:", insertError);
      return NextResponse.json(
        { error: "Scan completed but failed to store results" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Scan completed",
      summary: {
        totalModelsChecked: result.totalModelsChecked,
        activeCount: result.activeCount,
        errorCount: result.errorCount,
        newModelsFound: result.newModelsFound,
        alertCount: result.alerts.length,
      },
    });
  } catch (err) {
    console.error("[fal-scanner] Scan error:", err);
    return NextResponse.json(
      { error: "Scan failed: " + (err instanceof Error ? err.message : "Unknown error") },
      { status: 500 }
    );
  }
}
