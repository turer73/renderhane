import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const size = Number(searchParams.get("size")) || 192;
  // Clamp to valid PWA icon sizes
  const s = Math.min(Math.max(size, 48), 1024);
  const fontSize = Math.round(s * 0.5);
  const borderRadius = Math.round(s * 0.2);

  return new ImageResponse(
    (
      <div
        style={{
          fontSize,
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius,
          color: "white",
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        R
      </div>
    ),
    { width: s, height: s }
  );
}
