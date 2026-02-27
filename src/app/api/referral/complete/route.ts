import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  let body: { referralCode?: string; userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { referralCode, userId } = body;

  if (!referralCode || !userId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data, error } = await admin.rpc("complete_referral", {
    p_referral_code: referralCode,
    p_referee_id: userId,
  });

  if (error) {
    console.error("Complete referral failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json({ completed: data });
}
