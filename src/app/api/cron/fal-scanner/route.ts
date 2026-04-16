import "server-only";
import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { runScan } from "@/lib/fal/scanner";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { NextRequest, NextResponse } from "next/server";

// Scanner can take 30-60s to check all endpoints + scrape category pages
export const maxDuration = 120;

/**
 * Cron-triggered fal.ai model scanner.
 *
 * Schedule: every Monday at 09:00 UTC (via vercel.json)
 * Protected by CRON_SECRET so only Vercel Cron can call it.
 *
 * Flow:
 * 1. Run full scan (check all endpoints + scrape fal.ai for new models)
 * 2. Store results in fal_scan_results table
 * 3. If critical alerts found → email admin
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

  try {
    const result = await runScan();
    const admin = createAdminClient();

    // Store scan result
    await admin.from("fal_scan_results").insert({
      scanned_at: result.scannedAt,
      total_models_checked: result.totalModelsChecked,
      active_count: result.activeCount,
      error_count: result.errorCount,
      new_models_found: result.newModelsFound,
      endpoint_checks: result.endpointChecks,
      new_models: result.newModels,
      alerts: result.alerts,
    });

    // Email admin if there are critical alerts
    const criticalAlerts = result.alerts.filter((a) => a.severity === "critical");
    if (criticalAlerts.length > 0) {
      const adminEmails = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      if (adminEmails.length > 0) {
        try {
          const resend = getResend();
          const alertLines = criticalAlerts
            .map((a) => `- ${a.message}${a.detail ? ` (${a.detail})` : ""}`)
            .join("\n");

          await resend.emails.send({
            from: FROM_EMAIL,
            to: adminEmails,
            subject: `[Renderhane] fal.ai Tarama Uyarisi - ${criticalAlerts.length} sorun`,
            html: `
              <h2>fal.ai Model Tarama Sonucu</h2>
              <p><strong>Tarih:</strong> ${new Date(result.scannedAt).toLocaleString("tr-TR")}</p>
              <p><strong>Kontrol edilen:</strong> ${result.totalModelsChecked} model</p>
              <p><strong>Aktif:</strong> ${result.activeCount} | <strong>Hata:</strong> ${result.errorCount}</p>
              <p><strong>Yeni model:</strong> ${result.newModelsFound}</p>
              <hr/>
              <h3>Kritik Uyarilar (${criticalAlerts.length})</h3>
              <pre>${alertLines}</pre>
              <hr/>
              <p><a href="https://www.renderhane.com/tr/app/admin">Admin Paneli</a></p>
            `,
          });
        } catch (emailErr) {
          console.error("[fal-scanner-cron] Email send failed:", emailErr);
        }
      }
    }

    // Also notify about new models (info level)
    const newModelAlerts = result.alerts.filter((a) => a.type === "new_model");
    if (newModelAlerts.length > 0) {
      const adminEmails = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);

      if (adminEmails.length > 0) {
        try {
          const resend = getResend();
          const modelLines = result.newModels
            .map((m) => `- ${m.name} (${m.category}) — ${m.endpoint}`)
            .join("\n");

          await resend.emails.send({
            from: FROM_EMAIL,
            to: adminEmails,
            subject: `[Renderhane] ${newModelAlerts.length} yeni fal.ai model kesfedildi`,
            html: `
              <h2>Yeni fal.ai Modelleri</h2>
              <p>Haftalik taramada <strong>${newModelAlerts.length}</strong> yeni model bulundu:</p>
              <pre>${modelLines}</pre>
              <hr/>
              <p><a href="https://www.renderhane.com/tr/app/admin">Admin Paneli</a></p>
            `,
          });
        } catch (emailErr) {
          console.error("[fal-scanner-cron] New models email failed:", emailErr);
        }
      }
    }

    return NextResponse.json({
      message: "Cron scan completed",
      totalModelsChecked: result.totalModelsChecked,
      activeCount: result.activeCount,
      errorCount: result.errorCount,
      newModelsFound: result.newModelsFound,
      criticalAlerts: criticalAlerts.length,
      timestamp: result.scannedAt,
    });
  } catch (err) {
    console.error("[fal-scanner-cron] Scan failed:", err);
    return NextResponse.json(
      { error: "Scan failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
