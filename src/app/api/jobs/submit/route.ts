import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import type { ToolType, ModelTier } from "@/lib/fal/models";
import { validateJobSubmit } from "@/lib/validations/job-submit";

// Job submission can include auto bg-remove (~5s) + fal.ai queue submit
export const maxDuration = 60;

/** Human-readable tool names for auto-created project titles */
const TOOL_DISPLAY_NAMES: Record<ToolType, string> = {
  "3d-model": "3D Model",
  "bg-remove": "Arka Plan Kaldır",
  enhance: "Görsel İyileştir",
  scene: "Sahne Üret",
  video: "Video Oluştur",
  aplus: "A+ İçerik",
  "image-edit": "Görsel Düzenle",
  inpainting: "Inpainting",
  "object-removal": "Nesne Silme",
  "text-to-image": "AI Görsel Üret",
  "qr-code": "QR Kod",
  "talking-avatar": "Konuşan Avatar",
  "logo": "Logo Üret",
  "social-kit": "Sosyal Medya Paketi",
  "virtual-tryon": "Kıyafet Giydirme",
};

const ALLOWED_IMAGE_HOSTS = ["assets.renderhane.com"];

function isFalMedia(hostname: string): boolean {
  return hostname === "fal.media" || hostname.endsWith(".fal.media");
}

/** Validate a single image URL — returns error string or null if valid */
export function validateImageUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) {
    return "imageUrl must be a non-empty string";
  }

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return "Invalid imageUrl protocol";
    }

    const hostname = parsed.hostname;
    let isPrivate =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname === "[::1]";
    // 172.16.0.0/12 — only 172.16–31.x.x is private
    if (!isPrivate && hostname.startsWith("172.")) {
      const second = parseInt(hostname.split(".")[1], 10);
      isPrivate = second >= 16 && second <= 31;
    }

    if (isPrivate) {
      return "Invalid imageUrl: private addresses not allowed";
    }

    const isSupabaseStorage = hostname.endsWith(".supabase.co");
    const isAllowedHost =
      ALLOWED_IMAGE_HOSTS.includes(hostname) || isFalMedia(hostname);

    if (!isAllowedHost && !isSupabaseStorage) {
      return "imageUrl must be from a supported domain";
    }
  } catch {
    return "Invalid imageUrl format";
  }

  return null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 10 job submissions per minute per user
  const rl = await rateLimit(`job-submit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = validateJobSubmit(body);
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { tool, tier, modelKey, imageUrl, imageUrls, projectId, prompt, autoEnhance, skipBgRemove, extraParams } = parsed.data;

  // Resolve or auto-create a project for this job
  const thumbnailUrl = imageUrl ?? imageUrls?.[0] ?? "";
  let resolvedProjectId = projectId as string | undefined;
  if (!resolvedProjectId) {
    resolvedProjectId = await autoCreateProject(
      user.id,
      tool as ToolType,
      thumbnailUrl
    );
  }

  try {
    const result = await submitJob({
      userId: user.id,
      projectId: resolvedProjectId,
      tool: tool as ToolType,
      tier: tier as ModelTier | undefined,
      modelKey,
      imageUrl,
      imageUrls,
      prompt,
      autoEnhance: autoEnhance === true,
      skipBgRemove: skipBgRemove === true,
      extraParams: extraParams as Record<string, unknown> | undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }

    // Log detailed error server-side
    const internalMessage =
      error instanceof Error ? error.message : "Job submission failed";
    console.error("Job submission failed:", internalMessage, error);

    // Return a hint about the failure category (safe — no secrets exposed)
    let errorHint = "Job submission failed. Please try again.";
    if (internalMessage.includes("FAL_WEBHOOK_SECRET")) {
      errorHint = "Server configuration error (webhook). Contact support.";
    } else if (internalMessage.includes("FAL_KEY") || internalMessage.includes("fal")) {
      errorHint = "AI service connection error. Please try again later.";
    } else if (internalMessage.includes("SUPABASE") || internalMessage.includes("Missing")) {
      errorHint = "Database configuration error. Contact support.";
    } else if (internalMessage.includes("Failed to create job")) {
      errorHint = "Database write error. Please try again.";
    }

    return NextResponse.json(
      { error: errorHint },
      { status: 500 }
    );
  }
}

/**
 * Auto-create a project when a job is submitted without one.
 * Uses the source image as the project thumbnail and names
 * it after the tool + short timestamp.
 */
export async function autoCreateProject(
  userId: string,
  tool: ToolType,
  imageUrl: string
): Promise<string | undefined> {
  try {
    const client = await createClient();
    const toolName = TOOL_DISPLAY_NAMES[tool] || tool;
    const now = new Date();
    const dateStr = now.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const projectName = `${toolName} — ${dateStr}`;

    const { data, error } = await client
      .from("projects")
      .insert({
        user_id: userId,
        name: projectName,
        source_image_url: imageUrl,
        thumbnail_url: imageUrl,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Auto-create project failed:", error);
      return undefined; // Non-fatal: job still runs without project
    }

    return data.id;
  } catch (err) {
    console.error("Auto-create project error:", err);
    return undefined;
  }
}
