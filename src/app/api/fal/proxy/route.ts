import { route } from "@fal-ai/server-proxy/nextjs";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const { GET: falGET, POST: falPOST } = route;

/**
 * Wrap fal.ai proxy with authentication.
 * Without this, anyone could use our FAL_KEY credits.
 */
async function withAuth(
  request: NextRequest,
  handler: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handler(request);
}

export async function GET(request: NextRequest) {
  return withAuth(request, falGET as (req: NextRequest) => Promise<Response>);
}

export async function POST(request: NextRequest) {
  return withAuth(request, falPOST as (req: NextRequest) => Promise<Response>);
}
