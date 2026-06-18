import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys";

/**
 * API Key management — requires Supabase session auth (dashboard use).
 *
 * GET  /api/v1/keys — List all API keys
 * POST /api/v1/keys — Generate a new API key
 *   Body: { "name": "My Integration" }
 *
 * DELETE /api/v1/keys — Revoke an API key
 *   Body: { "keyId": "uuid" }
 */

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET() {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await listApiKeys(user.id);
    return NextResponse.json({ keys });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.slice(0, 100) : "Default";

    // Limit to 5 keys per user
    const existing = await listApiKeys(user.id);
    const activeKeys = existing.filter((k) => k.is_active);
    if (activeKeys.length >= 5) {
      return NextResponse.json(
        { error: "Maximum 5 active API keys allowed" },
        { status: 400 }
      );
    }

    const result = await generateApiKey(user.id, name);

    return NextResponse.json({
      key: result.key, // Only shown once!
      keyPrefix: result.keyPrefix,
      id: result.id,
      message: "Save this key — it will not be shown again.",
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    // Race backstop: the DB trigger (migration 20260618_api_key_limit_guard)
    // rejects a 6th+ active key when concurrent requests slip past the
    // app-level pre-check above. Surface it as a clean 409 rather than a 500. #622
    if (message.includes("API key limit reached")) {
      return NextResponse.json(
        { error: "Maximum 5 active API keys allowed" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { keyId } = body;

    if (!keyId || typeof keyId !== "string") {
      return NextResponse.json({ error: "keyId is required" }, { status: 400 });
    }

    await revokeApiKey(user.id, keyId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to revoke key";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
