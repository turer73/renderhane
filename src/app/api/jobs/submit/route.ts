import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { NextRequest, NextResponse } from "next/server";
import type { ToolType, ModelTier } from "@/lib/fal/models";

const VALID_TOOLS: ToolType[] = [
  "3d-model",
  "bg-remove",
  "enhance",
  "scene",
  "video",
  "aplus",
];

/** Human-readable tool names for auto-created project titles */
const TOOL_DISPLAY_NAMES: Record<ToolType, string> = {
  "3d-model": "3D Model",
  "bg-remove": "Arka Plan Kaldır",
  enhance: "Görsel İyileştir",
  scene: "Sahne Üret",
  video: "Video Oluştur",
  aplus: "A+ İçerik",
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { tool, tier, imageUrl, projectId, prompt } = body;

  if (!tool || !imageUrl) {
    return NextResponse.json(
      { error: "tool and imageUrl are required" },
      { status: 400 }
    );
  }

  if (typeof imageUrl !== "string" || !imageUrl) {
    return NextResponse.json(
      { error: "imageUrl must be a string" },
      { status: 400 }
    );
  }

  try {
    const parsed = new URL(imageUrl as string);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json(
        { error: "Invalid imageUrl protocol" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid imageUrl format" },
      { status: 400 }
    );
  }

  if (!VALID_TOOLS.includes(tool as ToolType)) {
    return NextResponse.json(
      { error: `Invalid tool type. Must be one of: ${VALID_TOOLS.join(", ")}` },
      { status: 400 }
    );
  }

  // Resolve or auto-create a project for this job
  let resolvedProjectId = projectId as string | undefined;
  if (!resolvedProjectId) {
    resolvedProjectId = await autoCreateProject(
      user.id,
      tool as ToolType,
      imageUrl as string
    );
  }

  try {
    const result = await submitJob({
      userId: user.id,
      projectId: resolvedProjectId,
      tool: tool as ToolType,
      tier: tier as ModelTier | undefined,
      imageUrl: imageUrl as string,
      prompt: typeof prompt === "string" ? prompt : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }
    console.error("Job submission failed:", error);
    return NextResponse.json(
      { error: "Job submission failed" },
      { status: 500 }
    );
  }
}

/**
 * Auto-create a project when a job is submitted without one.
 * Uses the source image as the project thumbnail and names
 * it after the tool + short timestamp.
 */
async function autoCreateProject(
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
