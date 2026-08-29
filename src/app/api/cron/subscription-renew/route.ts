import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";

/**
 * Cron job: Check for subscriptions due for renewal.
 *
 * Runs daily. For subscriptions where next_payment_at <= now():
 * - Mark as "past_due" (payment needs to be collected)
 * - In production: trigger iyzico stored card payment
 *
 * Schedule in vercel.json or Vercel Cron: "0 6 * * *" (daily at 06:00 UTC)
 *
 * Security: requires CRON_SECRET header
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/subscription-renew] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const actual = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const safe =
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  if (!safe) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find subscriptions due for renewal
  const { data: dueSubscriptions, error } = await supabase
    .from("subscriptions")
    .select("id, user_id, package_key, credits_per_period, price_per_period")
    .eq("status", "active")
    .lte("next_payment_at", new Date().toISOString());

  if (error) {
    console.error("[cron/subscription-renew] Query error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!dueSubscriptions?.length) {
    return NextResponse.json({ processed: 0 });
  }

  let renewed = 0;
  let failed = 0;

  for (const sub of dueSubscriptions) {
    try {
      // Mark as past_due — user will be prompted to pay manually.
      // Note: iyzico stored card (recurring) payment requires a separate
      // agreement with iyzico + cardToken integration. Until then, we
      // notify the user via email to renew manually.
      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
      if (updateError) {
        throw new Error(`Failed to mark subscription past_due: ${updateError.message}`);
      }

      // Get user email for notification
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", sub.user_id)
        .single();

      if (profile?.email) {
        try {
          const resend = getResend();
          await resend.emails.send({
            from: FROM_EMAIL,
            to: profile.email,
            subject: "Renderhane aboneliğiniz yenilenmeli",
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
                <h2 style="color:#6366f1">Abonelik Yenileme</h2>
                <p>Merhaba,</p>
                <p><strong>${sub.package_key}</strong> aboneliğinizin yenileme tarihi geldi. Hizmetinizin kesintisiz devam etmesi için lütfen kredi satın alın.</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL || "https://www.renderhane.com"}/tr/app/credits"
                   style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:500;margin-top:12px">
                  Kredi Satın Al
                </a>
                <p style="color:#888;font-size:13px;margin-top:24px">Renderhane — AI Görsel Stüdyosu</p>
              </div>
            `,
          });
        } catch (emailErr) {
          console.error(`[cron/subscription-renew] Email failed for ${sub.user_id}:`, emailErr);
        }
      }

      console.log(`[cron/subscription-renew] Subscription ${sub.id} marked as past_due`);
      renewed++;
    } catch (err) {
      console.error(`[cron/subscription-renew] Failed for ${sub.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json(
    { processed: dueSubscriptions.length, renewed, failed },
    { status: failed > 0 ? 500 : 200 }
  );
}
