import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  PACKAGES,
  isValidPackageKey,
  initializeCheckoutForm,
  signBasketId,
} from "@/lib/payments/iyzico";
import { headers } from "next/headers";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const { packageKey } = body as { packageKey: string };

    if (!packageKey || !isValidPackageKey(packageKey)) {
      return NextResponse.json(
        { error: "Invalid package key" },
        { status: 400 }
      );
    }

    const pkg = PACKAGES[packageKey];
    const priceStr = pkg.price.toFixed(2);
    const conversationId = crypto.randomUUID();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const callbackUrl = `${appUrl}/api/payments/callback`;

    // Get client IP from headers
    const headersList = await headers();
    const ip =
      headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headersList.get("x-real-ip") ||
      "127.0.0.1";

    // Fetch user profile for name/email/locale
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email, locale")
      .eq("id", user.id)
      .single();

    const fullName = profile?.full_name || user.email?.split("@")[0] || "User";
    const nameParts = fullName.split(" ");
    const firstName = nameParts[0] || "User";
    const lastName = nameParts.slice(1).join(" ") || "User";
    const email = profile?.email || user.email || "user@example.com";

    // basketId encodes userId:packageKey:locale, signed with HMAC to
    // prevent forgery. The locale is included so the callback can redirect
    // back to the correct language version of the credits page.
    const userLocale = profile?.locale || "tr";
    const basketId = signBasketId(user.id, packageKey, userLocale);

    const result = await initializeCheckoutForm({
      conversationId,
      price: priceStr,
      paidPrice: priceStr,
      basketId,
      callbackUrl,
      buyer: {
        id: user.id,
        name: firstName,
        surname: lastName,
        email,
        // identityNumber is a required field for Turkish payment regulations.
        // "11111111111" is the industry-standard placeholder for virtual/digital
        // product purchases where real identity verification is not required.
        identityNumber: "11111111111",
        registrationAddress: "Istanbul, Turkey",
        ip,
        city: "Istanbul",
        country: "Turkey",
      },
      basketItems: [
        {
          id: `credit-${packageKey}`,
          name: `${pkg.credits} Credits`,
          category1: "Digital Credits",
          itemType: "VIRTUAL",
          price: priceStr,
        },
      ],
    });

    return NextResponse.json({
      paymentPageUrl: result.paymentPageUrl,
      token: result.token,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to initialize payment" },
      { status: 500 }
    );
  }
}
