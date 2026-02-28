import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin-check";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Auth + admin check
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const body = await request.json();
  const admin = createAdminClient();

  // 2. Fetch current profile
  const { data: currentProfile, error: fetchError } = await admin
    .from("profiles")
    .select("credit_balance, display_name, unlimited_bg_remove")
    .eq("id", targetUserId)
    .single();

  if (fetchError || !currentProfile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // 3. Build update payload
  const updates: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    updates.display_name = body.displayName;
  }

  if (body.unlimitedBgRemove !== undefined) {
    updates.unlimited_bg_remove = body.unlimitedBgRemove;
  }

  // 4. Handle credit adjustment
  const newBalance = body.creditBalance !== undefined ? Number(body.creditBalance) : null;
  if (newBalance !== null && !isNaN(newBalance) && newBalance >= 0) {
    const currentBalance = currentProfile.credit_balance as number;
    const delta = newBalance - currentBalance;

    if (delta !== 0) {
      updates.credit_balance = newBalance;

      // Create audit transaction record
      const { error: txError } = await admin.from("credit_transactions").insert({
        user_id: targetUserId,
        amount: delta,
        type: delta > 0 ? "bonus" : "spend",
        status: "completed",
        description: `Admin: ${delta > 0 ? "+" : ""}${delta} kredi (${user.email})`,
      });

      if (txError) {
        return NextResponse.json(
          { error: `Failed to create transaction: ${txError.message}` },
          { status: 500 }
        );
      }
    }
  }

  // 5. Apply updates
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ success: true, message: "No changes" });
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", targetUserId);

  if (updateError) {
    return NextResponse.json(
      { error: `Failed to update: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
