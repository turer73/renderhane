import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { buildReferralInviteEmail } from "@/lib/email/templates/referral-invite";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 5 invites per 5 minutes per user
  const rl = await rateLimit(`referral-invite:${user.id}`, RATE_LIMITS.referralInvite);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { email?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  const locale = (body.locale === "en" ? "en" : "tr") as "tr" | "en";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
  }

  if (email === user.email) {
    return NextResponse.json({ error: "cannot_invite_self" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code, display_name, referral_count")
    .eq("id", user.id)
    .single();

  if (!profile?.referral_code) {
    return NextResponse.json({ error: "no_referral_code" }, { status: 400 });
  }

  if (profile.referral_count >= 5) {
    return NextResponse.json({ error: "max_referrals_reached" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("referrals")
    .select("id")
    .eq("referrer_id", user.id)
    .eq("referee_email", email)
    .single();

  if (existing) {
    return NextResponse.json({ error: "already_invited" }, { status: 409 });
  }

  const { error: insertError } = await admin
    .from("referrals")
    .insert({
      referrer_id: user.id,
      referee_email: email,
      referral_code: profile.referral_code,
    });

  if (insertError) {
    console.error("Failed to create referral:", insertError);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }

  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL}/ref/${profile.referral_code}`;
  const referrerName = profile.display_name || user.email || "Renderhane User";

  try {
    const { subject, html } = buildReferralInviteEmail({
      referrerName,
      referralLink,
      locale,
    });

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html,
    });
  } catch (emailError) {
    console.error("Failed to send invite email:", emailError);
  }

  return NextResponse.json({ success: true });
}
