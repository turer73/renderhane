import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Wireframe cube as a path-only SVG. Rendered via <img>, so it goes through
// resvg (not Satori) — keep it text-free; resvg has no app font to draw a
// <text> "R". The R monogram lives in the browser-rendered favicon instead.
const CUBE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none"><g stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M14 22 L14 50 L38 56 L38 28 Z"/><path d="M14 22 L30 14 L54 20 L38 28 Z"/><path d="M38 28 L54 20 L54 48 L38 56 Z"/><path d="M30 14 L30 42 L14 50" stroke-opacity="0.45"/><path d="M30 42 L54 48" stroke-opacity="0.45"/></g></svg>`;

export default function AppleIcon() {
  const cube = `data:image/svg+xml;base64,${Buffer.from(CUBE).toString("base64")}`;
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
          borderRadius: 36,
        }}
      >
        <img src={cube} width={130} height={130} alt="" />
      </div>
    ),
    { ...size }
  );
}
