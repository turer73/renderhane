import { ImageResponse } from "next/og";

export const alt = "Renderhane — AI Product Visual Studio";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OGImage() {
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
