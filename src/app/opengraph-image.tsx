import { ImageResponse } from "next/og";

export const alt = "Renderhane — AI Product Visual Studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Path-only cube (no <text>): rendered through resvg via <img>, which has no
// app font to draw a monogram. The wordmark below carries the "renderhane" text.
const CUBE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><g stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M14 22 L14 50 L38 56 L38 28 Z"/><path d="M14 22 L30 14 L54 20 L38 28 Z"/><path d="M38 28 L54 20 L54 48 L38 56 Z"/><path d="M30 14 L30 42 L14 50" stroke-opacity="0.45"/><path d="M30 42 L54 48" stroke-opacity="0.45"/></g></svg>`;

export default function OGImage() {
  const cube = `data:image/svg+xml;base64,${Buffer.from(CUBE).toString("base64")}`;
  return new ImageResponse(
    (
      <div
        style={{
          background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #6d28d9 100%)",
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cube} width={104} height={104} alt="" style={{ marginBottom: 24 }} />
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
          AI-Powered 3D Models & Product Visuals
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 20,
            opacity: 0.85,
            display: "flex",
            gap: 32,
          }}
        >
          <span>🛒 E-Commerce</span>
          <span>🎮 Gaming</span>
          <span>🖨️ 3D Printing</span>
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 16,
            opacity: 0.6,
            display: "flex",
            gap: 20,
          }}
        >
          <span>3D Model</span>
          <span>•</span>
          <span>PBR Texture</span>
          <span>•</span>
          <span>Scene</span>
          <span>•</span>
          <span>Video</span>
          <span>•</span>
          <span>STL Export</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
