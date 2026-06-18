import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { rateLimit } from "@/lib/rate-limit";

const DAILY_LIMIT = {
  limit: 3,
  windowSeconds: 86400,
};

export async function POST(request: NextRequest) {
  try {
    // cf-connecting-ip (Cloudflare, trusted) önce; sonra x-real-ip; son çare
    // XFF'nin EN SAGDAKI parçasi (en yakin proxy ekler, spoof'a daha dayanikli).
    // Onceki "XFF[0]" client tarafindan spoof edilip gunluk-limit atlanabiliyordu.
    const xff = request.headers.get("x-forwarded-for");
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-real-ip") ||
      xff?.split(",").map((s) => s.trim()).filter(Boolean).pop() ||
      "unknown";

    const rl = await rateLimit(`demo-bg:${ip}`, DAILY_LIMIT);
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

    const body = await request.json();
    const { imageDataUrl } = body;

    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return NextResponse.json(
        { error: "imageDataUrl is required" },
        { status: 400 }
      );
    }

    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "Invalid image format" },
        { status: 400 }
      );
    }

    const result = await getAIProvider().subscribe("fal-ai/birefnet/v2", {
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
