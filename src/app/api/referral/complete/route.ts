import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/referral/complete
 * Protected: requires authenticated user session.
 * The caller must be the referee (userId must match session user).
 */
export async function POST(request: NextRequest) {
  // Authenticate the user — never trust userId from the request body
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { referralCode?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { referralCode } = body;

  if (!referralCode || typeof referralCode !== "string") {
    return NextResponse.json({ error: "Missing referralCode" }, { status: 400 });
  }

  // Validate referral code format (8 hex chars)
  if (!/^[a-f0-9]{8}$/i.test(referralCode)) {
    return NextResponse.json({ error: "Invalid referral code format" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("complete_referral", {
    p_referral_code: referralCode,
    p_referee_id: user.id, // Use authenticated user ID, not client-supplied
  });

  if (error) {
    console.error("Complete referral failed:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }

  return NextResponse.json({ completed: data });
}
