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

  // Get the output for this job — prefer permanent R2 URL
  const { data: output, error } = await supabase
    .from("outputs")
    .select("r2_url, fal_url")
    .eq("job_id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !output) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  const url = output.r2_url || output.fal_url;
  if (!url) {
    return NextResponse.json({ error: "Result not found" }, { status: 404 });
  }

  return NextResponse.redirect(url);
}
