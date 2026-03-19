import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { refundCredits } from "@/lib/credits/engine";
import { NextRequest, NextResponse } from "next/server";

/**
 * Cron: Clean up stuck jobs.
 *
 * Finds jobs stuck in "processing" for >15 minutes (webhook never arrived).
 * Refunds credits and marks them as failed.
 *
 * Schedule: every 10 minutes via Vercel Cron.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization") || "";
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`;
  const authBuf = Buffer.from(authHeader);
  const expectedBuf = Buffer.from(expected);
  if (
    !process.env.CRON_SECRET ||
    authBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(authBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString(); // 15 min ago

  // Find stuck jobs: processing + started >15 min ago
  const { data: stuckJobs, error } = await supabase
    .from("jobs")
    .select("id, credit_tx_id, user_id, tool")
    .in("status", ["processing", "pending"])
    .lt("created_at", cutoff)
    .limit(50);

  if (error || !stuckJobs || stuckJobs.length === 0) {
    return NextResponse.json({
      cleaned: 0,
      timestamp: new Date().toISOString(),
    });
  }

  let refunded = 0;
  let failed = 0;

  for (const job of stuckJobs) {
    try {
      // Refund credits if reserved
      if (job.credit_tx_id) {
        try {
          await refundCredits(job.credit_tx_id);
          refunded++;
        } catch {
          // May already be refunded — non-fatal
        }
      }

      // Mark job as failed
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error_message: "Processing timeout — credits refunded automatically",
          completed_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      failed++;
    } catch (err) {
      console.error(`[stuck-jobs] Failed to clean job ${job.id}:`, err);
    }
  }

  if (failed > 0) {
    console.log(`[stuck-jobs] Cleaned ${failed} stuck jobs, refunded ${refunded} credit transactions`);
  }

  return NextResponse.json({
    cleaned: failed,
    refunded,
    timestamp: new Date().toISOString(),
  });
}
