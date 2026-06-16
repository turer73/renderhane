import { getAIProvider } from "@/lib/ai";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestId = request.nextUrl.searchParams.get("requestId");
  if (!requestId) {
    return NextResponse.json({ error: "requestId required" }, { status: 400 });
  }

  try {
    const status = await getAIProvider().status("fal-ai/triposr/remeshing", requestId);

    if (status.status === "COMPLETED") {
      const result = await getAIProvider().result<{ model_mesh?: { url?: string } }>(
        "fal-ai/triposr/remeshing",
        requestId
      );

      return NextResponse.json({
        status: "completed",
        url: result.model_mesh?.url || null,
      });
    }

    if ((status.status as string) === "FAILED") {
      return NextResponse.json({
        status: "failed",
        error: "Remeshing failed",
      });
    }

    return NextResponse.json({
      status: "processing",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ status: "failed", error: msg });
  }
}
