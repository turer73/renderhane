import { createClient } from "@/lib/supabase/server";
import { submitJob } from "@/lib/jobs/submit";
import { CreditError } from "@/lib/credits/engine";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { tool, tier, imageUrl, projectId } = body;

  if (!tool || !imageUrl) {
    return NextResponse.json(
      { error: "tool and imageUrl are required" },
      { status: 400 }
    );
  }

  try {
    const result = await submitJob({
      userId: user.id,
      projectId,
      tool,
      tier,
      imageUrl,
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
