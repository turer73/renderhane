import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin-check";
import { getAIProvider } from "@/lib/ai";
import { routeRequest } from "@/lib/fal/smart-router";
import { MODELS, TOOL_MODELS, type ToolType } from "@/lib/fal/models";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// Live fal probe can take a while (3D/video models)
export const maxDuration = 120;

/**
 * POST /api/admin/models/test — admin-only live probe of adminOnly models.
 *
 * Body: { tool, modelKey, prompt?, imageUrl?, audioUrl? }
 * - No DB writes, no credit reservation. REAL fal.ai spend — admin only.
 * - modelKey must exist, be adminOnly, and belong to the given tool.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rl = await rateLimit(`lab:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please wait." },
      { status: 429 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { tool, modelKey, prompt, imageUrl, audioUrl } = body;

  if (typeof tool !== "string" || !(tool in TOOL_MODELS)) {
    return NextResponse.json({ error: "Invalid tool" }, { status: 400 });
  }
  const model = typeof modelKey === "string" ? MODELS[modelKey] : undefined;
  if (!model) {
    return NextResponse.json({ error: "Unknown modelKey" }, { status: 400 });
  }
  if (!model.adminOnly) {
    return NextResponse.json(
      { error: "Only admin-lab models can be probed here" },
      { status: 400 }
    );
  }
  if (!TOOL_MODELS[tool as ToolType].includes(modelKey as string)) {
    return NextResponse.json(
      { error: "Model does not belong to this tool" },
      { status: 400 }
    );
  }

  // talking-avatar carries audio via prompt (same convention as submitJob);
  // heygen's video source goes through imageUrl (imageParamKey "video_url").
  const effectivePrompt =
    tool === "talking-avatar"
      ? ((audioUrl as string) ?? (prompt as string))
      : (prompt as string | undefined);

  let falInput: Record<string, unknown>;
  try {
    ({ input: falInput } = routeRequest({
      tool: tool as ToolType,
      modelKey: modelKey as string,
      imageUrl: imageUrl as string | undefined,
      prompt: effectivePrompt,
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid input" },
      { status: 400 }
    );
  }

  const started = Date.now();
  try {
    const result = await getAIProvider().subscribe(
      model.id,
      falInput
    );
    const ms = Date.now() - started;
    const { url, kind } = extractLabOutput(
      result.data as Record<string, unknown>
    );
    if (!url) {
      return NextResponse.json(
        { error: "Probe succeeded but no output URL found" },
        { status: 502 }
      );
    }
    return NextResponse.json({
      modelKey,
      endpoint: model.id,
      ms,
      outputUrl: url,
      kind,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Probe failed",
      },
      { status: 502 }
    );
  }
}

function asUrl(value: unknown): string | null {
  const url = (value as { url?: string } | undefined)?.url;
  return typeof url === "string" && url.startsWith("http") ? url : null;
}

function extractLabOutput(payload: Record<string, unknown>): {
  url: string | null;
  kind: "video" | "image" | "audio" | "glb" | "file";
} {
  const mesh = asUrl(payload.model_mesh) ?? asUrl(payload.model_glb);
  if (mesh) return { url: mesh, kind: "glb" };
  const video = asUrl(payload.video);
  if (video) return { url: video, kind: "video" };
  const image = asUrl(payload.image);
  if (image) return { url: image, kind: "image" };
  const images = payload.images as { url?: string }[] | undefined;
  if (images?.[0]?.url) return { url: images[0].url, kind: "image" };
  const audio = asUrl(payload.audio);
  if (audio) return { url: audio, kind: "audio" };
  if (typeof payload.result_url === "string") {
    return { url: payload.result_url, kind: "file" };
  }
  return { url: null, kind: "file" };
}
