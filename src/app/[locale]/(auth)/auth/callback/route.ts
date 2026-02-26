import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, pathname } = new URL(request.url);
  const code = searchParams.get("code");

  // Extract locale from the path: /en/auth/callback -> "en"
  const locale = pathname.split("/")[1] || "tr";

  // Use trusted origin from env instead of request-derived origin
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

  return NextResponse.redirect(`${baseUrl}/${locale}/app`);
}
