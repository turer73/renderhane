import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

// Remeshing can take 15-30s — extend Vercel function timeout
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit
  const rl = rateLimit(`remesh:${user.id}`, RATE_LIMITS.jobSubmit);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: { outputId: string; format?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { outputId, format } = body;
  if (!outputId) {
    return NextResponse.json({ error: "outputId required" }, { status: 400 });
  }
  const validFormats = ["glb", "stl", "fbx", "obj"] as const;
  const outputFormat = validFormats.includes(format as typeof validFormats[number])
    ? (format as string)
    : "glb";

  // Fetch the output record — verify ownership + get URL
  const admin = createAdminClient();
  const { data: output, error: fetchError } = await admin
    .from("outputs")
    .select("id, type, fal_url, r2_url, user_id")
    .eq("id", outputId)
    .single();

  if (fetchError || !output) {
    return NextResponse.json({ error: "Output not found" }, { status: 404 });
  }

  if (output.user_id !== user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  if (output.type !== "glb") {
    return NextResponse.json(
      { error: "Only 3D models (GLB) can be remeshed" },
      { status: 400 }
    );
  }

  const modelUrl = output.r2_url || output.fal_url;
  if (!modelUrl) {
    return NextResponse.json({ error: "No model URL" }, { status: 400 });
  }

  try {
    console.log("[remesh] Starting:", { outputId, modelUrl, outputFormat });

    // Try fal.run first (simpler, no queue), fallback to fal.subscribe
    const result = await fal.subscribe("fal-ai/triposr/remeshing", {
      input: {
        object_url: modelUrl,
        output_format: outputFormat,
        faces: outputFormat === "stl" ? 50000 : 30000,
        merge: true,
        preserve_uvs: outputFormat !== "stl",
      },
    });

    console.log("[remesh] Result keys:", Object.keys(result.data || {}));

    const remeshed = result.data as {
      model_mesh?: { url?: string };
    };

    if (!remeshed.model_mesh?.url) {
      console.error("[remesh] No output URL. Full result:", JSON.stringify(result.data).slice(0, 500));
      return NextResponse.json(
        { error: "Remeshing completed but no output file was returned" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      url: remeshed.model_mesh.url,
      format: outputFormat,
      message: "Model rebuilt successfully",
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const falErr = error as { status?: number; body?: { detail?: string } };
    console.error("[remesh] Error:", {
      message: errMsg,
      status: falErr.status,
      detail: falErr.body?.detail,
      modelUrl,
      outputFormat,
    });
    return NextResponse.json(
      { error: `Remeshing failed: ${falErr.body?.detail || errMsg}` },
      { status: 500 }
    );
  }
}
