import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { TOOLS_MULTI_IMAGE, TOOLS_TEXT_ONLY, MAX_MULTI_IMAGES } from "@/lib/fal/models";
import type { ToolType, ModelTier } from "@/lib/fal/models";

// Job submission can include auto bg-remove (~5s) + fal.ai queue submit
export const maxDuration = 60;

const VALID_TOOLS = ["3d-model", "bg-remove", "enhance", "scene", "video", "aplus", "image-edit", "inpainting", "object-removal", "text-to-image", "qr-code", "talking-avatar", "logo", "social-kit", "virtual-tryon"] as const;

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
    const isPrivate =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("172.") ||
      hostname === "169.254.169.254" ||
      hostname.endsWith(".internal") ||
      hostname === "[::1]";

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
  const rl = rateLimit(`job-submit:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tool, tier, imageUrl, imageUrls, projectId, prompt, autoEnhance } = body;

  if (!tool) {
    return NextResponse.json(
      { error: "tool is required" },
      { status: 400 }
    );
  }

  if (!VALID_TOOLS.includes(tool as ToolType)) {
    return NextResponse.json(
      { error: `Invalid tool type. Must be one of: ${VALID_TOOLS.join(", ")}` },
      { status: 400 }
    );
  }

  const isMultiImage = TOOLS_MULTI_IMAGE.includes(tool as ToolType);
  const isTextOnly = TOOLS_TEXT_ONLY.includes(tool as ToolType);

  // Validate image inputs based on tool type
  let validatedImageUrl: string | undefined;
  let validatedImageUrls: string[] | undefined;

  // Some tools support BOTH text-only and image modes (video: Kling t2v vs Wan i2v)
  const hasPromptOnly = prompt && typeof prompt === "string" && prompt.trim() && !imageUrl && !imageUrls;
  const isHybridTool = ["video", "3d-model"].includes(tool as string);

  if (isTextOnly || (isHybridTool && hasPromptOnly)) {
    // Text-only mode: require prompt, no image needed
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "prompt is required for this tool" },
        { status: 400 }
      );
    }
  } else if (isMultiImage) {
    // Multi-image tools: require imageUrls array
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json(
        { error: `imageUrls array is required for ${tool} (1-${MAX_MULTI_IMAGES} images)` },
        { status: 400 }
      );
    }

    if (imageUrls.length > MAX_MULTI_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_MULTI_IMAGES} images allowed` },
        { status: 400 }
      );
    }

    // Validate each URL
    for (const url of imageUrls) {
      const urlError = validateImageUrl(url);
      if (urlError) {
        return NextResponse.json({ error: urlError }, { status: 400 });
      }
    }

    validatedImageUrls = imageUrls as string[];
  } else {
    // Single-image tools: require imageUrl
    if (!imageUrl) {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    const urlError = validateImageUrl(imageUrl);
    if (urlError) {
      return NextResponse.json({ error: urlError }, { status: 400 });
    }

    validatedImageUrl = imageUrl as string;
  }

  // Resolve or auto-create a project for this job
  const thumbnailUrl = validatedImageUrl ?? validatedImageUrls?.[0] ?? "";
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
      imageUrl: validatedImageUrl,
      imageUrls: validatedImageUrls,
      prompt: typeof prompt === "string" ? prompt : undefined,
      autoEnhance: autoEnhance === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }

    // Log detailed error server-side, return generic message to client
    const internalMessage =
      error instanceof Error ? error.message : "Job submission failed";
    console.error("Job submission failed:", internalMessage, error);

    return NextResponse.json(
      { error: "Job submission failed. Please try again." },
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
    const adminClient = createAdminClient();
    const toolName = TOOL_DISPLAY_NAMES[tool] || tool;
    const now = new Date();
    const dateStr = now.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const projectName = `${toolName} — ${dateStr}`;

    const { data, error } = await adminClient
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
