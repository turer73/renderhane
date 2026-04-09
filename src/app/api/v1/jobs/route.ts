import { NextRequest, NextResponse } from "next/server";
import { authenticateApiRequest } from "@/lib/api-keys/middleware";
import { submitJob } from "@/lib/jobs/submit";
import { submitJobSync } from "@/lib/jobs/submit-sync";
import { CreditError } from "@/lib/credits/engine";
import { TOOL_CREDITS, type ToolType } from "@/lib/fal/models";
import type { ModelTier } from "@/lib/fal/models";
import {
  orchestrateAplus,
  orchestrateTalkingAvatar,
  orchestrateSocialKit,
} from "@/lib/jobs/orchestrate";

const VALID_TOOLS = Object.keys(TOOL_CREDITS);

/** Orchestration tools that spawn multiple jobs or have multi-step pipelines */
const ORCHESTRATION_TOOLS: ToolType[] = ["aplus", "social-kit", "talking-avatar"];

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
 *     "prompt": "...",                       // optional, for scene/video/text tools
 *     "sync": true,                          // optional: wait for result (default: false)
 *     "script": "Hello world",               // optional: TTS text for talking-avatar
 *     "audioUrl": "https://...",              // optional: pre-made audio for talking-avatar
 *     "locale": "tr"                          // optional: tr|en for orchestration tools
 *   }
 *
 * Returns (simple async):  { "jobId": "uuid", "creditCost": 1, "estimatedTime": "~3s" }
 * Returns (simple sync):   { "jobId": "uuid", "creditCost": 1, "status": "completed", "output": { "url": "..." } }
 * Returns (orchestration):  { "jobIds": ["uuid", ...], "totalCost": 32, "estimatedTime": "~1min" }
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateApiRequest(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();
    const { tool, imageUrl, imageUrls, tier, prompt, sync, script, audioUrl, locale } = body;

    if (!tool || !VALID_TOOLS.includes(tool)) {
      return NextResponse.json(
        { error: `Invalid tool. Valid tools: ${VALID_TOOLS.join(", ")}` },
        { status: 400 }
      );
    }

    // ── Orchestration tools (multi-job pipelines) ────────────
    if (ORCHESTRATION_TOOLS.includes(tool as ToolType)) {
      return handleOrchestration(auth.userId, tool as ToolType, {
        imageUrl,
        script,
        audioUrl,
        locale,
      });
    }

    // ── Standard single-job tools ────────────────────────────
    if (sync) {
      const result = await submitJobSync({
        userId: auth.userId,
        tool: tool as ToolType,
        tier: tier as ModelTier | undefined,
        imageUrl,
        imageUrls,
        prompt,
      });
      const status = result.status === "completed" ? 201 : 500;
      return NextResponse.json(result, { status });
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

/**
 * Handle orchestration tools that require multi-step pipelines.
 */
async function handleOrchestration(
  userId: string,
  tool: ToolType,
  opts: {
    imageUrl?: string;
    script?: string;
    audioUrl?: string;
    locale?: string;
  }
): Promise<NextResponse> {
  const { imageUrl, script, audioUrl, locale } = opts;

  // All orchestration tools require an image
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json(
      { error: "imageUrl is required" },
      { status: 400 }
    );
  }

  try {
    switch (tool) {
      case "aplus": {
        const result = await orchestrateAplus({
          userId,
          imageUrl,
          locale,
        });
        return NextResponse.json(result, { status: 201 });
      }

      case "talking-avatar": {
        if (!script && !audioUrl) {
          return NextResponse.json(
            { error: "Either script (text) or audioUrl is required for talking-avatar" },
            { status: 400 }
          );
        }
        const result = await orchestrateTalkingAvatar({
          userId,
          imageUrl,
          script,
          audioUrl,
        });
        return NextResponse.json(result, { status: 201 });
      }

      case "social-kit": {
        const result = await orchestrateSocialKit({
          userId,
          imageUrl,
          locale,
        });
        return NextResponse.json(result, { status: 201 });
      }

      default:
        return NextResponse.json(
          { error: `Orchestration not implemented for tool: ${tool}` },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json(
        { error: "insufficient_credits" },
        { status: 402 }
      );
    }
    const message = error instanceof Error ? error.message : "Processing failed";
    console.error(`[api/v1/jobs] ${tool} orchestration error:`, message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
