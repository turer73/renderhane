import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PACKAGES, type PackageKey } from "@/lib/payments/iyzico";

/**
 * Subscription management.
 *
 * GET  /api/subscriptions — Get user's active subscription
 * POST /api/subscriptions — Create a new subscription (after payment)
 *   Body: { "packageKey": "monthly", "paymentId": "..." }
 * PATCH /api/subscriptions — Cancel subscription
 *   Body: { "action": "cancel" }
 */

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscription: data });
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { packageKey, paymentId } = body;

  if (!packageKey || !paymentId) {
    return NextResponse.json(
      { error: "packageKey and paymentId are required" },
      { status: 400 }
    );
  }

  // Only monthly packages are subscriptions
  if (packageKey !== "monthly") {
    return NextResponse.json(
      { error: "Only monthly package supports subscriptions" },
      { status: 400 }
    );
  }

  const pkg = PACKAGES[packageKey as PackageKey];
  if (!pkg) {
    return NextResponse.json({ error: "Invalid package" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Cancel any existing active subscription
  await supabase
    .from("subscriptions")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .eq("status", "active");

  // Create new subscription
  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      user_id: user.id,
      package_key: packageKey,
      credits_per_period: pkg.credits,
      price_per_period: pkg.price,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscription: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  if (body.action !== "cancel") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("subscriptions")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
