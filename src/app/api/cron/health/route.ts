import "server-only";
import crypto from "crypto";
import { fal } from "@fal-ai/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import {
  buildServiceDownEmail,
  buildServiceRecoveredEmail,
} from "@/lib/email/templates/health-alert";
import { NextRequest, NextResponse } from "next/server";

const SERVICE_ID = "fal-ai";

/**
 * Cron-triggered health check for fal.ai.
 *
 * Schedule: every 12 hours (normal) or 30 min (recovery mode).
 * Protected by CRON_SECRET so only Vercel Cron can call it.
 *
 * Flow:
 * 1. Ping fal.ai with a lightweight queue submit + cancel
 * 2. Update system_status table
 * 3. Log to system_health_logs
 * 4. If status CHANGED → send admin email (down or recovered)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret with timing-safe comparison
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
  const startTime = Date.now();

  let isHealthy = false;
  let errorMessage: string | null = null;

  // ── Ping fal.ai ──────────────────────────────────────
  try {
    // Use the cheapest/fastest model for health check.
    // Submit + immediately cancel = no credits consumed.
    const result = await fal.queue.submit("fal-ai/birefnet/v2", {
      input: {
        image_url: "https://placehold.co/100x100/png",
      },
    });

    // If we get a request_id, fal.ai is responsive
    if (result.request_id) {
      isHealthy = true;
      // Cancel immediately to avoid consuming resources
      try {
        await fal.queue.cancel("fal-ai/birefnet/v2", {
          requestId: result.request_id,
        });
      } catch {
        // Cancel failure is non-fatal — the request will time out naturally
      }
    }
  } catch (err) {
    isHealthy = false;
    errorMessage =
      err instanceof Error ? err.message : "fal.ai ping failed";
  }

  const responseTime = Date.now() - startTime;

  // ── Read current status ──────────────────────────────
  const { data: current } = await supabase
    .from("system_status")
    .select("*")
    .eq("id", SERVICE_ID)
    .single();

  const wasHealthy = current?.is_healthy ?? true;
  const statusChanged = wasHealthy !== isHealthy;

  // ── Update system_status ─────────────────────────────
  const updates: Record<string, unknown> = {
    is_healthy: isHealthy,
    last_check_at: new Date().toISOString(),
  };

  if (isHealthy) {
    updates.consecutive_failures = 0;
    updates.last_error = null;
  } else {
    updates.consecutive_failures = (current?.consecutive_failures ?? 0) + 1;
    updates.last_error = errorMessage;
    if (!current?.last_down_at || wasHealthy) {
      updates.last_down_at = new Date().toISOString();
    }
  }

  await supabase
    .from("system_status")
    .update(updates)
    .eq("id", SERVICE_ID);

  // ── Log health check ─────────────────────────────────
  await supabase.from("system_health_logs").insert({
    service: SERVICE_ID,
    status: isHealthy ? "ok" : "error",
    response_time_ms: responseTime,
    error_message: errorMessage,
  });

  // ── Send admin email on status change ────────────────
  if (statusChanged) {
    const adminEmails = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (adminEmails.length > 0) {
      try {
        const resend = getResend();

        if (!isHealthy) {
          // Service went DOWN
          const email = buildServiceDownEmail({
            service: SERVICE_ID,
            errorMessage: errorMessage || undefined,
            consecutiveFailures:
              (current?.consecutive_failures ?? 0) + 1,
          });
          await resend.emails.send({
            from: FROM_EMAIL,
            to: adminEmails,
            subject: email.subject,
            html: email.html,
          });
        } else {
          // Service RECOVERED
          const email = buildServiceRecoveredEmail({
            service: SERVICE_ID,
            downSince: current?.last_down_at
              ? new Date(current.last_down_at).toLocaleString("tr-TR")
              : undefined,
          });
          await resend.emails.send({
            from: FROM_EMAIL,
            to: adminEmails,
            subject: email.subject,
            html: email.html,
          });
        }
      } catch (emailErr) {
        console.error("[health] Admin email send failed:", emailErr);
      }
    }
  }

  return NextResponse.json({
    service: SERVICE_ID,
    healthy: isHealthy,
    responseTime,
    statusChanged,
    timestamp: new Date().toISOString(),
  });
}
