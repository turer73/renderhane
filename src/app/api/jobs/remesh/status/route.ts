import { fal } from "@fal-ai/client";
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
    const status = await fal.queue.status("fal-ai/triposr/remeshing", {
      requestId,
      logs: false,
    });

    if (status.status === "COMPLETED") {
      // Fetch the result
      const result = await fal.queue.result("fal-ai/triposr/remeshing", {
        requestId,
      });

      const data = result.data as { model_mesh?: { url?: string } };

      return NextResponse.json({
        status: "completed",
        url: data.model_mesh?.url || null,
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
