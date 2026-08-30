import { createClient } from "@/lib/supabase/server";
import { orchestrateSocialKit } from "@/lib/jobs/orchestrate";
import { CreditError } from "@/lib/credits/engine";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { NextRequest, NextResponse } from "next/server";
import { validateImageUrl, autoCreateProject } from "@/lib/jobs/api-helpers";

// Social Kit submits 5 parallel jobs — needs extended timeout
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`job-submit-social:${user.id}`, RATE_LIMITS.jobSubmit);
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

  const { imageUrl, projectId } = body;

  const urlError = validateImageUrl(imageUrl);
  if (urlError) {
    return NextResponse.json({ error: urlError }, { status: 400 });
  }

  // Detect locale
  const { data: profile } = await supabase
    .from("profiles")
    .select("locale")
    .eq("id", user.id)
    .single();
  const locale = (profile?.locale || "tr") as "tr" | "en";

  // Auto-create project
  let resolvedProjectId = projectId as string | undefined;
  if (!resolvedProjectId) {
    resolvedProjectId = await autoCreateProject(
      user.id,
      "scene", // Uses scene tool type for project naming
      imageUrl as string
    );
  }

  try {
    const result = await orchestrateSocialKit({
      userId: user.id,
      projectId: resolvedProjectId,
      imageUrl: imageUrl as string,
      locale,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CreditError && error.code === "INSUFFICIENT") {
      return NextResponse.json({ error: "insufficient_credits" }, { status: 402 });
    }

    const message = error instanceof Error ? error.message : "Social Kit submission failed";
    console.error("[submit-social-kit] orchestration error:", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
