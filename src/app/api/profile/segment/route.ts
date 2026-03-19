import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

const VALID_SEGMENTS = ["ecommerce", "gaming", "3dprint"] as const;
type Segment = (typeof VALID_SEGMENTS)[number];

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { useCase?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { useCase } = body;

  if (!useCase || !VALID_SEGMENTS.includes(useCase as Segment)) {
    return NextResponse.json(
      { error: "useCase must be one of: ecommerce, gaming, 3dprint" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ use_case: useCase })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to update segment" },
      { status: 500 }
    );
  }

  return NextResponse.json({ useCase });
}
