import { NextRequest, NextResponse } from "next/server";
import { getAIProvider } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";

const DAILY_LIMIT = {
  limit: 3,
  windowSeconds: 86400,
};

export async function POST(request: NextRequest) {
  try {
    // Renderhane Vercel'de DOGRUDAN servis edilir (CF proxy ARKASINDA DEGIL — A
    // kaydi 76.76.21.21 Vercel). Bu yuzden cf-connecting-ip GUVENILMEZ: saldirgan
    // her istekte farkli deger gonderip yeni rate-limit anahtari uretebilir, 3/gun
    // demo limitini atlar -> sinirsiz ucretli fal.ai (Codex PR#23 P1). Vercel'in
    // set ettigi x-real-ip (trusted) + son care XFF'nin EN SAGDAKI parcasi
    // (en yakin proxy=Vercel ekler). cf-connecting-ip zincirden CIKARILDI.
    const xff = request.headers.get("x-forwarded-for");
    const ip =
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
    // fal hata detayi (status/body) yalniz Vercel log'unda kaliyordu; dashboard
    // erisimi olmayan ortamdan teshis icin system_health_logs'a da yaz.
    // Response'a HICBIR detay sizmaz.
    try {
      const err = error as { status?: number; body?: unknown };
      await createAdminClient().from("system_health_logs").insert({
        service: "demo-bg-remove",
        status: "error",
        error_message: JSON.stringify({
          status: err.status ?? null,
          body: err.body ?? null,
          message: error instanceof Error ? error.message : String(error),
        }).slice(0, 2000),
      });
    } catch {
      // teshis logu yazilamazsa istegi etkileme
    }
    return NextResponse.json(
      { error: "Processing failed" },
      { status: 500 }
    );
  }
}
