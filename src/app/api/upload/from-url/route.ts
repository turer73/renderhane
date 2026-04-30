import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import crypto from "crypto";

// External image download can be slow
export const maxDuration = 30;

/** Max image size: 10 MB */
const MAX_SIZE = 10 * 1024 * 1024;

/** Allowed content types */
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 URL uploads per minute
  const rl = await rateLimit(`url-upload:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429 }
    );
  }

  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url } = body;
  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Validate URL format
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    // Block private/internal addresses
    const h = parsed.hostname;
    if (
      h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" ||
      h.startsWith("10.") || h.startsWith("192.168.") || h.startsWith("172.") ||
      h === "169.254.169.254" || h.endsWith(".internal") || h === "[::1]"
    ) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Download image server-side (no CORS issues)
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Renderhane/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to download image" },
        { status: 422 }
      );
    }

    const contentType = res.headers.get("content-type")?.split(";")[0] || "";
    if (!ALLOWED_TYPES.includes(contentType)) {
      return NextResponse.json(
        { error: "URL must point to an image (jpg, png, webp)" },
        { status: 422 }
      );
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "Image too large (max 10 MB)" },
        { status: 422 }
      );
    }

    // Upload to Supabase storage
    const ext = contentType.split("/")[1] || "jpg";
    const filename = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const path = `${user.id}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from("uploads")
      .upload(path, buffer, { contentType });

    if (uploadError) {
      return NextResponse.json(
        { error: "Upload failed" },
        { status: 500 }
      );
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("uploads")
      .createSignedUrl(path, 3600);

    if (signedUrlError || !signedUrlData?.signedUrl) {
      return NextResponse.json(
        { error: "Failed to create signed URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ signedUrl: signedUrlData.signedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Download failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
