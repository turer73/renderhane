import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ShopifyClient } from "@/lib/integrations/shopify/client";

/**
 * Shopify integration endpoints.
 *
 * POST /api/integrations/shopify
 *   action: "verify"   — Verify store connection
 *   action: "products" — List products with images
 *   action: "push"     — Push processed image back to Shopify
 */

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, shopDomain, accessToken } = body;

    if (!shopDomain || !accessToken) {
      return NextResponse.json(
        { error: "shopDomain and accessToken are required" },
        { status: 400 }
      );
    }

    const client = new ShopifyClient(shopDomain, accessToken);

    switch (action) {
      case "verify": {
        const shop = await client.verifyConnection();
        return NextResponse.json({ success: true, shop });
      }

      case "products": {
        const limit = body.limit || 50;
        const pageInfo = body.pageInfo || undefined;
        const result = await client.getProducts(limit, pageInfo);
        return NextResponse.json(result);
      }

      case "push": {
        const { productId, imageUrl, alt } = body;
        if (!productId || !imageUrl) {
          return NextResponse.json(
            { error: "productId and imageUrl are required" },
            { status: 400 }
          );
        }
        const image = await client.addProductImage(productId, imageUrl, alt);
        return NextResponse.json({ success: true, image });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: verify, products, push" },
          { status: 400 }
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Shopify API error";
    console.error("[shopify] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
