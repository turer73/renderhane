import { createClient } from "@/lib/supabase/server";
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

  // Check for referral cookie
  const refCode = request.cookies.get("ref_code")?.value;

  if (refCode) {
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // Complete referral (non-blocking, fire-and-forget)
      try {
        await fetch(`${baseUrl}/api/referral/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ referralCode: refCode, userId: user.id }),
        });
      } catch (err) {
        console.error("Referral completion failed:", err);
      }
    }

    // Clear the referral cookie and redirect
    const response = NextResponse.redirect(`${baseUrl}/${locale}/app`);
    response.cookies.delete("ref_code");
    return response;
  }

  return NextResponse.redirect(`${baseUrl}/${locale}/app`);
}
