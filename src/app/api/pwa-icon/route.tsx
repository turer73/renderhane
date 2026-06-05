import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

// Path-only cube (no <text>): rendered through resvg via <img>, which has no
// app font for a monogram. Edge runtime → encode with btoa (Buffer is absent).
const CUBE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><g stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M14 22 L14 50 L38 56 L38 28 Z"/><path d="M14 22 L30 14 L54 20 L38 28 Z"/><path d="M38 28 L54 20 L54 48 L38 56 Z"/><path d="M30 14 L30 42 L14 50" stroke-opacity="0.45"/><path d="M30 42 L54 48" stroke-opacity="0.45"/></g></svg>`;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const size = Number(searchParams.get("size")) || 192;
  // Clamp to valid PWA icon sizes
  const s = Math.min(Math.max(size, 48), 1024);
  const borderRadius = Math.round(s * 0.2);
  const cubeSize = Math.round(s * 0.62);
  const cube = `data:image/svg+xml;base64,${btoa(CUBE)}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
          borderRadius,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cube} width={cubeSize} height={cubeSize} alt="" />
      </div>
    ),
    { width: s, height: s }
  );
}
