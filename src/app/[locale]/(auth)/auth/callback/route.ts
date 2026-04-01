import { createClient } from "@/lib/supabase/server";
import { completeReferral } from "@/lib/referral/complete";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);
  const code = searchParams.get("code");
  const locale = pathname.split("/")[1] || "tr";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/${locale}/login?error=missing_code`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${baseUrl}/${locale}/login?error=auth_failed`
    );
  }

  // Get user for referral + onboarding check
  const { data: { user } } = await supabase.auth.getUser();

  // Check for referral cookie
  const refCode = request.cookies.get("ref_code")?.value;

  if (refCode && user) {
    try {
      await completeReferral(refCode, user.id);
    } catch (err) {
      console.error("Referral completion failed:", err);
    }
  }

  // Segment selection is optional — always go to dashboard.
  // Users can change their segment from dashboard settings.
  const destination = `${baseUrl}/${locale}/app`;

  if (refCode) {
    const response = NextResponse.redirect(destination);
    response.cookies.delete("ref_code");
    return response;
  }

  return NextResponse.redirect(destination);
}
