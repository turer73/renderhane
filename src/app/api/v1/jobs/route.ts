import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-keys/middleware";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { TOOL_CREDITS, type ToolType } from "@/lib/fal/models";
import type { ModelTier } from "@/lib/fal/models";

const VALID_TOOLS = Object.keys(TOOL_CREDITS);

/**
 * POST /api/v1/jobs — Submit a new job via public API.
 *
 * Headers:
 *   Authorization: Bearer rh_xxxxxxxxxxxx
 *
 * Body (JSON):
 *   {
 *     "tool": "bg-remove",
 *     "imageUrl": "https://...",
 *     "imageUrls": ["https://...", ...],   // optional, for multi-image tools
 *     "tier": "standard",                   // optional: fast|standard|premium
 *     "prompt": "..."                       // optional, for scene/video/text tools
 *   }
 *
 * Returns:
 *   { "jobId": "uuid", "creditCost": 1, "estimatedTime": "~3s" }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { tool, imageUrl, imageUrls, tier, prompt } = body;

    if (!tool || !VALID_TOOLS.includes(tool)) {
      return NextResponse.json(
        { error: `Invalid tool. Valid tools: ${VALID_TOOLS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await submitJob({
      userId: auth.userId,
      tool: tool as ToolType,
      tier: tier as ModelTier | undefined,
      imageUrl,
      imageUrls,
      prompt,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Internal error";
    console.error("[api/v1/jobs] submit error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
