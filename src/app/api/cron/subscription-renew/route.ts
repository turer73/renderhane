import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
  const cronSecret = request.headers.get("authorization");
  if (cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
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
      // TODO: In production, trigger iyzico stored card payment here.
      // For now, mark as past_due — user will be prompted to pay manually.
      await supabase
        .from("subscriptions")
        .update({
          status: "past_due",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      // TODO: Send renewal reminder email via Resend
      console.log(`[cron/subscription-renew] Subscription ${sub.id} marked as past_due`);
      renewed++;
    } catch (err) {
      console.error(`[cron/subscription-renew] Failed for ${sub.id}:`, err);
      failed++;
    }
  }

  return NextResponse.json({ processed: dueSubscriptions.length, renewed, failed });
}
