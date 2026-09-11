import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import {
  buildServiceDownEmail,
  buildServiceRecoveredEmail,
} from "@/lib/email/templates/health-alert";
import { NextRequest, NextResponse } from "next/server";

const SERVICE_ID = "fal-ai";
const FAL_MODEL_ID = "fal-ai/birefnet/v2";
const FAL_METADATA_URL =
  "https://api.fal.ai/v1/models?endpoint_id=fal-ai%2Fbirefnet%2Fv2&limit=1";

async function checkFalPlatform(): Promise<void> {
  const apiKey = process.env.FAL_KEY?.trim();
  if (!apiKey) throw new Error("FAL_KEY is not configured");

  const response = await fetch(FAL_METADATA_URL, {
    method: "GET",
    headers: { Authorization: `Key ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`fal.ai platform check returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as { models?: unknown };
  const models = Array.isArray(body.models) ? body.models : [];
  const modelAvailable = models.some(
    (model) =>
      model !== null &&
      typeof model === "object" &&
      (model as { endpoint_id?: unknown }).endpoint_id === FAL_MODEL_ID
  );
  if (!modelAvailable) {
    throw new Error("fal.ai platform check did not return the required model");
  }
}

/**
 * Cron-triggered health check for fal.ai.
 *
 * Protected by CRON_SECRET so only an authorized scheduler can call it.
 *
 * Flow:
 * 1. Read authenticated fal.ai model metadata without starting inference
 * 2. Update system_status table
 * 3. Log to system_health_logs
 * 4. If status CHANGED → send admin email (down or recovered)
 *
 * This is a credential/control-plane/model-discovery check. It deliberately
 * does not claim that inference execution, account quota, or a specific runner
 * is healthy.
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

  // ── Check fal.ai without opening a paid inference request ────────────────
  try {
    await checkFalPlatform();
    isHealthy = true;
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
    check: "platform_model_metadata",
    healthy: isHealthy,
    responseTime,
    statusChanged,
    timestamp: new Date().toISOString(),
  });
}
