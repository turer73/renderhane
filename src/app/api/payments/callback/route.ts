import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  PACKAGES,
  isValidPackageKey,
  retrieveCheckoutFormResult,
} from "@/lib/payments/iyzico";

// Use service role client — user session cookies are not available in
// iyzico's server-to-server callback.
function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Default locale for redirect (will be overridden if we can detect it)
  let locale = "tr";

  try {
    // iyzico posts the token as form data
    const formData = await request.formData();
    const token = formData.get("token") as string | null;

    if (!token) {
      return NextResponse.redirect(
        `${appUrl}/${locale}/app/credits?status=error`,
        { status: 303 }
      );
    }

    // Verify payment result with iyzico
    const result = await retrieveCheckoutFormResult(token);

    if (result.paymentStatus !== "SUCCESS") {
      console.error("Payment failed:", result.errorMessage ?? result.paymentStatus);
      return NextResponse.redirect(
        `${appUrl}/${locale}/app/credits?status=error`,
        { status: 303 }
      );
    }

    // Decode basketId → "userId:packageKey"
    const [userId, packageKey] = (result.basketId || "").split(":");

    if (!userId || !packageKey || !isValidPackageKey(packageKey)) {
      console.error("Invalid basketId:", result.basketId);
      return NextResponse.redirect(
        `${appUrl}/${locale}/app/credits?status=error`,
        { status: 303 }
      );
    }

    const pkg = PACKAGES[packageKey];
    const paymentId = result.paymentId;

    // --- Idempotency check: prevent double-crediting ---
    const supabase = getServiceClient();

    const { data: existingTx } = await supabase
      .from("credit_transactions")
      .select("id")
      .eq("payment_id", paymentId)
      .maybeSingle();

    if (existingTx) {
      // Already processed — redirect to success
      return NextResponse.redirect(
        `${appUrl}/${locale}/app/credits?status=success`,
        { status: 303 }
      );
    }

    // --- Add credits via the same RPC the credit engine uses ---
    const { data, error } = await supabase.rpc("add_credits", {
      p_user_id: userId,
      p_amount: pkg.credits,
      p_payment_id: paymentId,
      p_description: `Purchased ${pkg.name} package (${pkg.credits} credits)`,
    });

    if (error) {
      console.error("Failed to add credits:", error.message);
      return NextResponse.redirect(
        `${appUrl}/${locale}/app/credits?status=error`,
        { status: 303 }
      );
    }

    console.log(
      `Credits added: ${pkg.credits} to user ${userId}, tx=${data}, paymentId=${paymentId}`
    );

    return NextResponse.redirect(
      `${appUrl}/${locale}/app/credits?status=success`,
      { status: 303 }
    );
  } catch (error) {
    console.error("Callback error:", error);
    return NextResponse.redirect(
      `${appUrl}/${locale}/app/credits?status=error`,
      { status: 303 }
    );
  }
}
