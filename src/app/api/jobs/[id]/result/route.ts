import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get the output for this job
  const { data: output, error } = await supabase
    .from("outputs")
    .select("fal_url")
    .eq("job_id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !output?.fal_url) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  return NextResponse.redirect(output.fal_url);
}
