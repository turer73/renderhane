import { NextRequest, NextResponse } from "next/server";

/**
 * Asset Proxy — serves R2 files through the same origin to bypass CORS.
 *
 * Usage: /api/assets/proxy?url=<encoded-r2-url>
 *
 * Only allows proxying from our own R2 domain (assets.renderhane.com)
 * to prevent open-proxy abuse.
 */

const CORS_ALLOWED_ORIGINS = [
  "https://renderhane.com",
  "https://www.renderhane.com",
  "http://localhost:3000",
];

function getAllowedOrigin(origin: string | null): string {
  if (origin && CORS_ALLOWED_ORIGINS.includes(origin)) return origin;
  return "https://renderhane.com";
}

const ALLOWED_HOSTS = ["assets.renderhane.com"];

// Never relay arbitrary HTML/JavaScript as an application-origin document.
const MEDIA_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp", "image/tiff",
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/flac", "audio/webm",
  "video/mp4", "video/webm", "video/quicktime", "video/ogg",
]);
const DOWNLOAD_TYPES = new Set([
  "application/octet-stream", "binary/octet-stream", "model/gltf-binary", "model/gltf+json",
  "application/json", "application/zip", "application/x-zip-compressed", "model/stl", "application/sla",
  "image/svg+xml",
]);

function isFalMedia(hostname: string): boolean {
  return hostname === "fal.media" || hostname.endsWith(".fal.media");
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");

  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  // Validate the URL is from an allowed host
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  // Allow exact hosts + any fal.media subdomain
  const isAllowed =
    ALLOWED_HOSTS.includes(parsed.hostname) || isFalMedia(parsed.hostname);

  if (!isAllowed) {
    return NextResponse.json(
      { error: "URL host not allowed" },
      { status: 403 }
    );
  }

  // SSRF hardening: only https (allowed hosts are https; blocks file:/gopher:/etc.)
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || (parsed.port && parsed.port !== "443")) {
    return NextResponse.json(
      { error: "Only https URLs are allowed" },
      { status: 400 }
    );
  }

  // Fetch from origin.
  // SSRF hardening: do NOT auto-follow redirects — an allowed host could
  // 302 to an internal/arbitrary URL and fetch would follow it past the
  // allowlist. Our R2 + fal.media serve assets directly (no legitimate
  // redirects), so a redirect response is rejected.
  const upstream = await fetch(rawUrl, {
    headers: {
      "Accept": "*/*",
    },
    redirect: "manual",
  });

  if (
    upstream.type === "opaqueredirect" ||
    (upstream.status >= 300 && upstream.status < 400)
  ) {
    return NextResponse.json(
      { error: "Upstream redirect not allowed" },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    return NextResponse.json(
      { error: `Upstream error: ${upstream.status}` },
      { status: upstream.status }
    );
  }

  // Stream the response back with proper headers
  const contentType = (upstream.headers.get("content-type") || "application/octet-stream").split(";", 1)[0].trim().toLowerCase();
  if (!MEDIA_TYPES.has(contentType) && !DOWNLOAD_TYPES.has(contentType)) {
    await upstream.body?.cancel();
    return NextResponse.json({ error: "Unsupported asset content type" }, { status: 415, headers: { "Cache-Control": "no-store" } });
  }
  const contentLength = upstream.headers.get("content-length");

  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Access-Control-Allow-Origin": getAllowedOrigin(request.headers.get("origin")),
  };

  if (DOWNLOAD_TYPES.has(contentType)) {
    headers["Content-Disposition"] = 'attachment; filename="asset"';
  }

  if (contentLength) {
    headers["Content-Length"] = contentLength;
  }

  return new NextResponse(upstream.body, {
    status: 200,
    headers,
  });
}
