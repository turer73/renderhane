import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("credit_balance, use_case")
      .eq("id", user.id)
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch balance" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      balance: profile?.credit_balance ?? 0,
      useCase: profile?.use_case ?? null,
    });
  } catch (error) {
    console.error("[credits/balance] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
