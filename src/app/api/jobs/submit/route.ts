import { createClient } from "@/lib/supabase/server";
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

  const { tool, tier, imageUrl, projectId } = body;

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

  try {
    const result = await submitJob({
      userId: user.id,
      projectId: projectId as string | undefined,
      tool: tool as ToolType,
      tier: tier as ModelTier | undefined,
      imageUrl: imageUrl as string,
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
