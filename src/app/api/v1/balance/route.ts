import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-keys/middleware";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/v1/balance — Get current credit balance.
 *
 * Headers:
 *   Authorization: Bearer rh_xxxxxxxxxxxx
 *
 * Returns:
 *   { "balance": 42 }
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("credit_balance")
    .eq("id", auth.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json({ balance: data.credit_balance });
}
