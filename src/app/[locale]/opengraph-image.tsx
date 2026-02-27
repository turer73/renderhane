import { ImageResponse } from "next/og";

export const alt = "Renderhane — AI Product Visual Studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const subtitle =
    locale === "tr"
      ? "E-Ticaret Mağazanız İçin AI Stüdyosu"
      : "AI Studio for Your E-Commerce Store";

  const features =
    locale === "tr"
      ? ["🎨 Ürün Görseli", "📦 3D Model", "🎬 Video", "✂️ Arka Plan Silme"]
      : ["🎨 Product Visuals", "📦 3D Model", "🎬 Video", "✂️ BG Remove"];

  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "sans-serif",
          color: "white",
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            marginBottom: 16,
          }}
        >
          renderhane.
        </div>
        <div
          style={{
            fontSize: 28,
            opacity: 0.9,
            maxWidth: 600,
            textAlign: "center",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
        <div
          style={{
            marginTop: 40,
            fontSize: 18,
            opacity: 0.7,
            display: "flex",
            gap: 24,
          }}
        >
          {features.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
