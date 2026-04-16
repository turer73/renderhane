import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fal } from "@fal-ai/client";
import { NextResponse } from "next/server";

/**
 * Admin-only diagnostics endpoint.
 * Checks all infrastructure components that the job pipeline depends on.
 * GET /api/admin/diagnostics
 */
export async function GET() {
  // 1. Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin check
  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 2. Environment variables
  checks["env:NEXT_PUBLIC_SUPABASE_URL"] = {
    ok: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    detail: process.env.NEXT_PUBLIC_SUPABASE_URL ? "set" : "MISSING",
  };
  checks["env:SUPABASE_SERVICE_ROLE_KEY"] = {
    ok: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    detail: process.env.SUPABASE_SERVICE_ROLE_KEY ? `set (${process.env.SUPABASE_SERVICE_ROLE_KEY.slice(0, 10)}...)` : "MISSING",
  };
  checks["env:FAL_KEY"] = {
    ok: !!process.env.FAL_KEY,
    detail: process.env.FAL_KEY ? `set (${process.env.FAL_KEY.slice(0, 10)}...)` : "MISSING",
  };
  checks["env:FAL_WEBHOOK_SECRET"] = {
    ok: !!process.env.FAL_WEBHOOK_SECRET,
    detail: process.env.FAL_WEBHOOK_SECRET ? "set" : "MISSING",
  };
  checks["env:NEXT_PUBLIC_APP_URL"] = {
    ok: !!process.env.NEXT_PUBLIC_APP_URL,
    detail: process.env.NEXT_PUBLIC_APP_URL || "MISSING",
  };

  // 3. Supabase admin client — query jobs table
  try {
    const { count, error } = await adminClient
      .from("jobs")
      .select("id", { count: "exact", head: true });

    checks["supabase:jobs_table"] = error
      ? { ok: false, detail: `Error: ${error.message} (${error.code})` }
      : { ok: true, detail: `accessible (${count} rows)` };
  } catch (err) {
    checks["supabase:jobs_table"] = {
      ok: false,
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. Supabase RPC — check reserve_credits function exists
  try {
    // Call with invalid data to test if function exists (will error with "insufficient" or "not found")
    const { error } = await adminClient.rpc("reserve_credits", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_amount: 1,
      p_description: "diagnostics test",
    });

    // We expect an error since user doesn't exist — but it should be a business logic error, not a missing function
    if (error) {
      const isExpected = error.message.includes("user_not_found") || error.message.includes("insufficient");
      checks["supabase:reserve_credits_rpc"] = {
        ok: isExpected,
        detail: isExpected ? "function exists and works" : `Unexpected error: ${error.message}`,
      };
    } else {
      // Shouldn't succeed, but if it does, function exists
      checks["supabase:reserve_credits_rpc"] = { ok: true, detail: "function exists" };
    }
  } catch (err) {
    checks["supabase:reserve_credits_rpc"] = {
      ok: false,
      detail: `Exception: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 5. fal.ai client — test with a lightweight endpoint probe
  try {
    // Just check if client can make an authenticated request by checking queue status of a fake ID
    // This will error with 404 (not found) which is expected — confirms auth works
    await fal.queue.status("fal-ai/birefnet/v2", {
      requestId: "diagnostic-check-fake-id",
    });
    checks["fal:client_auth"] = { ok: true, detail: "authenticated" };
  } catch (err) {
    const falErr = err as { status?: number; message?: string };
    if (falErr.status === 404 || falErr.status === 422) {
      // 404/422 = auth worked, just fake request ID not found — this is good
      checks["fal:client_auth"] = { ok: true, detail: `authenticated (got expected ${falErr.status})` };
    } else if (falErr.status === 401 || falErr.status === 403) {
      checks["fal:client_auth"] = { ok: false, detail: `Auth failed: ${falErr.status} — FAL_KEY may be invalid` };
    } else {
      checks["fal:client_auth"] = {
        ok: false,
        detail: `Error: ${falErr.status || ""} ${falErr.message || String(err)}`,
      };
    }
  }

  // 6. Webhook URL check
  const webhookBase = process.env.NEXT_PUBLIC_APP_URL;
  checks["webhook:base_url"] = {
    ok: !!webhookBase && (webhookBase.startsWith("https://") || webhookBase.startsWith("http://localhost")),
    detail: webhookBase || "MISSING",
  };

  // Summary
  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json({
    status: allOk ? "healthy" : "ISSUES_FOUND",
    timestamp: new Date().toISOString(),
    checks,
  });
}
