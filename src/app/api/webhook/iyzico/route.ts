import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  PACKAGES,
  isValidPackageKey,
  retrieveCheckoutFormResult,
} from "@/lib/payments/iyzico";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * iyzico webhook handler — backup confirmation mechanism.
 * The primary flow is through the callback URL, but iyzico also sends
 * webhook notifications for payment events.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, paymentConversationId } = body;

    console.log("iyzico webhook received:", {
      token: token ? "present" : "missing",
      paymentConversationId,
    });

    if (!token) {
      return NextResponse.json({ status: "ok" });
    }

    // Verify payment with iyzico
    const result = await retrieveCheckoutFormResult(token);

    if (result.paymentStatus !== "SUCCESS") {
      console.log("Webhook: payment not successful, skipping");
      return NextResponse.json({ status: "ok" });
    }

    // Decode basketId
    const [userId, packageKey] = (result.basketId || "").split(":");

    if (!userId || !packageKey || !isValidPackageKey(packageKey)) {
      console.error("Webhook: invalid basketId:", result.basketId);
      return NextResponse.json({ status: "ok" });
    }

    const pkg = PACKAGES[packageKey];
    const paymentId = result.paymentId;

    // Idempotency check
    const supabase = getServiceClient();

    const { data: existingTx } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existingTx) {
      console.log("Webhook: payment already processed, skipping");
      return NextResponse.json({ status: "ok" });
    }

    // Add credits
    const { error } = await supabase.rpc("add_credits", {
      p_user_id: userId,
      p_amount: pkg.credits,
      p_payment_id: paymentId,
      p_description: `Purchased ${pkg.name} package (${pkg.credits} credits) [webhook]`,
    });

    if (error) {
      console.error("Webhook: failed to add credits:", error.message);
    } else {
      console.log(
        `Webhook: credits added: ${pkg.credits} to user ${userId}, paymentId=${paymentId}`
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    // Always return 200 to prevent iyzico from retrying indefinitely
    return NextResponse.json({ status: "ok" });
  }
}
