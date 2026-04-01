import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Anonymous background removal endpoint.
 *
 * - No auth required — available to anyone
 * - Rate limited: 3 requests per day per IP
 * - Accepts base64 image data URL via JSON body
 * - Calls fal.ai birefnet/v2 for BG removal
 * - Returns the result image URL
 */

const DAILY_LIMIT = {
  limit: 3,
  windowSeconds: 86400, // 24 hours
};

fal.config({
  credentials: process.env.FAL_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    // Get IP for rate limiting
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    // Rate limit check
    const rl = rateLimit(`demo-bg:${ip}`, DAILY_LIMIT);
    if (!rl.success) {
      return NextResponse.json(
        {
          error: "Daily limit reached. Sign up for unlimited access!",
          errorTr: "Günlük limit doldu. Sınırsız erişim için kayıt olun!",
          remaining: 0,
        },
        { status: 429 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { imageDataUrl } = body;

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 }
      );
    }

    // Validate it's a data URL (base64 image)
    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Invalid image format" },
        { status: 400 }
      );
    }

    // Call fal.ai birefnet for background removal
    const result = await fal.subscribe("fal-ai/birefnet/v2", {
      input: {
        image_url: imageDataUrl,
        model: "General Use (Light)",
        operating_resolution: "1024x1024",
        output_format: "png",
      },
    });

    const outputUrl =
      (result.data as Record<string, unknown>)?.image &&
      typeof (result.data as Record<string, { url: string }>).image === "object"
        ? (result.data as Record<string, { url: string }>).image.url
        : null;

    if (!outputUrl) {
      return NextResponse.json(
        { error: "Background removal failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      resultUrl: outputUrl,
      remaining: rl.remaining,
    });
  } catch (error) {
    console.error("[demo/bg-remove] Error:", error);
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
