import { fal } from "@fal-ai/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToR2 } from "@/lib/r2/upload";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";

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

  let body: { outputId: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { outputId } = body;
  if (!outputId) {
    return NextResponse.json({ error: "outputId required" }, { status: 400 });
  }

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
    // Call fal.ai remeshing — synchronous (fal.subscribe)
    const result = await fal.subscribe("fal-ai/triposr/remeshing", {
      input: {
        object_url: modelUrl,
        output_format: "glb",
        faces: 30000,
        merge: true,
        preserve_uvs: true,
      },
    });

    const remeshed = result.data as {
      model_mesh?: { url?: string };
    };

    if (!remeshed.model_mesh?.url) {
      return NextResponse.json(
        { error: "Remeshing failed — no output" },
        { status: 500 }
      );
    }

    // Upload remeshed model to R2
    let r2Url: string | null = null;
    try {
      const r2Result = await uploadToR2(
        remeshed.model_mesh.url,
        user.id,
        "glb"
      );
      r2Url = r2Result.r2Url;
    } catch {
      // Fallback to fal URL if R2 upload fails
    }

    const permanentUrl = r2Url || remeshed.model_mesh.url;

    // Update the existing output record with the repaired URL
    await admin
      .from("outputs")
      .update({
        fal_url: remeshed.model_mesh.url,
        r2_url: r2Url,
      })
      .eq("id", outputId);

    return NextResponse.json({
      url: permanentUrl,
      message: "Model repaired successfully",
    });
  } catch (error) {
    console.error("Remesh error:", error);
    return NextResponse.json(
      { error: "Remeshing failed" },
      { status: 500 }
    );
  }
}
