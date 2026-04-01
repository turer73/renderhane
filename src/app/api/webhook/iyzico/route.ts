import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import {
  PACKAGES,
  isValidPackageKey,
  retrieveCheckoutFormResult,
  verifyBasketId,
} from "@/lib/payments/iyzico";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * iyzico webhook handler — backup confirmation mechanism.
 *
 * The primary flow is through the callback URL, but iyzico also sends
 * webhook notifications for payment events.
 *
 * AUTHENTICATION: iyzico checkout form webhooks do not use a shared
 * secret or signature header. Instead, authentication is performed by
 * calling `retrieveCheckoutFormResult(token)` which makes a server-to-
 * server API call to iyzico using our API credentials. If the token is
 * invalid or forged, iyzico's API will reject the request — this IS the
 * standard authentication mechanism for checkout form webhooks.
 *
 * IDEMPOTENCY: The `add_credits` RPC uses INSERT ... ON CONFLICT
 * (payment_id) DO NOTHING at the database level, so even if both the
 * callback and webhook fire simultaneously, only one will succeed.
 */
export async function POST(request: NextRequest) {
  try {
    // Validate Content-Type — iyzico sends webhook notifications as JSON
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn("Webhook: unexpected Content-Type:", contentType);
      return NextResponse.json({ status: "ok" });
    }

    const body = await request.json();

    // Validate that the webhook payload has the expected structure
    if (!body || typeof body !== "object") {
      console.warn("Webhook: invalid payload structure");
      return NextResponse.json({ status: "ok" });
    }

    const { token } = body;

    if (!token) {
      return NextResponse.json({ status: "ok" });
    }

    // Verify payment with iyzico — this is the authentication step.
    // retrieveCheckoutFormResult makes a server-to-server call using our
    // API credentials. A forged or invalid token will be rejected by iyzico.
    const result = await retrieveCheckoutFormResult(token);

    if (result.paymentStatus !== "SUCCESS") {
      return NextResponse.json({ status: "ok" });
    }

    // Verify HMAC-signed basketId → { userId, packageKey, locale }
    const basketData = verifyBasketId(result.basketId);

    if (!basketData || !isValidPackageKey(basketData.packageKey)) {
      console.error("Webhook: invalid or tampered basketId:", result.basketId);
      return NextResponse.json({ status: "ok" });
    }

    const { userId, packageKey } = basketData;
    const pkg = PACKAGES[packageKey];
    const paymentId = result.paymentId;

    // Add credits — the DB-level ON CONFLICT guard ensures idempotency.
    // If add_credits returns NULL, it means this payment was already
    // processed (e.g. by the callback), and no duplicate credits were added.
    const supabase = getServiceClient();

    const { error } = await supabase.rpc("add_credits", {
      p_user_id: userId,
      p_amount: pkg.credits,
      p_payment_id: paymentId,
      p_description: `Purchased ${pkg.name} package (${pkg.credits} credits) [webhook]`,
    });

    if (error) {
      console.error("Webhook: failed to add credits:", error.message);
    }
    // data === null means duplicate (already processed) — that's OK

    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("Webhook error:", error);
    // Always return 200 to prevent iyzico from retrying indefinitely
    return NextResponse.json({ status: "ok" });
  }
}
