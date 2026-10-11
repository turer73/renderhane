import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { IMAGE_MAX_PIXELS } from "@/lib/media/image-formats";
import { ASSET_ORIGIN, THUMB_WIDTHS } from "@/lib/thumb-url";

/**
 * Thumbnail endpoint: /api/assets/thumb?url=<encoded-asset-url>&w=<80|160>
 *
 * Gallery tiles are 40–80 CSS px, but outputs are often multi-megapixel
 * originals. This fetches the original from our R2 bucket, downsizes it to a
 * small square WebP and lets the browser cache it.
 *
 * Signed-in only: resizing costs CPU, so it is not open to anonymous callers.
 */

export const runtime = "nodejs";

const RASTER_TYPES = new Set([
  "image/png", "image/jpeg", "image/webp", "image/gif", "image/avif", "image/bmp", "image/tiff",
]);
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
const RESIZE_TIMEOUT_SECONDS = 10;
// Object keys look like outputs/<user>/<uuid>.png: no dot segments, no encoding tricks.
const SAFE_PATH = /^\/(?:[A-Za-z0-9_-][A-Za-z0-9._-]*\/)*[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  const width = Number(request.nextUrl.searchParams.get("w"));
  if (!rawUrl) return error("Missing url parameter", 400);
  if (!(THUMB_WIDTHS as readonly number[]).includes(width)) return error("Unsupported width", 400);

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return error("Invalid url", 400);
  }
  if (parsed.origin !== ASSET_ORIGIN || parsed.username || parsed.password) return error("URL not allowed", 403);
  if (!SAFE_PATH.test(parsed.pathname)) return error("Invalid asset path", 400);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return error("Unauthorized", 401);

  // Only the object path comes from the caller; the origin is fixed, and
  // redirects are refused (same rule as /api/assets/proxy).
  const upstream = await fetch(`${ASSET_ORIGIN}/${parsed.pathname.slice(1)}`, { headers: { Accept: "image/*" }, redirect: "manual" });
  if (upstream.type === "opaqueredirect" || (upstream.status >= 300 && upstream.status < 400)) {
    return error("Upstream redirect not allowed", 502);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel();
    return error(`Upstream error: ${upstream.status}`, upstream.status === 404 ? 404 : 502);
  }

  const contentType = (upstream.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const declaredLength = Number(upstream.headers.get("content-length") || 0);
  if (!RASTER_TYPES.has(contentType) || declaredLength > MAX_SOURCE_BYTES) {
    await upstream.body?.cancel();
    return error("Unsupported source image", 415);
  }

  const source = new Uint8Array(await upstream.arrayBuffer());
  if (source.byteLength > MAX_SOURCE_BYTES) return error("Unsupported source image", 415);

  let thumb: Buffer;
  try {
    thumb = await sharp(source, { limitInputPixels: IMAGE_MAX_PIXELS, pages: 1 })
      .timeout({ seconds: RESIZE_TIMEOUT_SECONDS })
      .rotate()
      .resize(width, width, { fit: "cover" })
      .webp({ quality: 70 })
      .toBuffer();
  } catch {
    return error("Could not resize image", 422);
  }

  return new NextResponse(new Uint8Array(thumb), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(thumb.byteLength),
      // Asset URLs are content-addressed (uuid paths), so the result never changes.
      "Cache-Control": "private, max-age=604800, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
