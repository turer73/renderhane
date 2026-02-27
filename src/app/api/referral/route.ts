import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code, referral_count, unlimited_bg_remove, free_bg_remove_daily, free_bg_remove_used, free_bg_remove_date")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const { data: referrals } = await supabase
    .from("referrals")
    .select("id, referee_email, status, referrer_reward, created_at, completed_at")
    .eq("referrer_id", user.id)
    .order("created_at", { ascending: false });

  const isToday = profile.free_bg_remove_date === new Date().toISOString().split("T")[0];
  const usedToday = isToday ? profile.free_bg_remove_used : 0;
  const remainingToday = profile.unlimited_bg_remove
    ? -1
    : Math.max(0, profile.free_bg_remove_daily - usedToday);

  return NextResponse.json({
    referralCode: profile.referral_code,
    referralLink: `${process.env.NEXT_PUBLIC_APP_URL}/ref/${profile.referral_code}`,
    referralCount: profile.referral_count,
    maxReferrals: 5,
    totalCreditsEarned: (referrals || [])
      .filter((r: { status: string }) => r.status === "completed")
      .reduce((sum: number, r: { referrer_reward: number }) => sum + r.referrer_reward, 0),
    unlimitedBgRemove: profile.unlimited_bg_remove,
    freeBgRemoveToday: remainingToday,
    referrals: referrals || [],
  });
}
