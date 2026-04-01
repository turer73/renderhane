import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { validateApiKey } from "@/lib/api-keys";
import { rateLimit } from "@/lib/rate-limit";

const API_RATE_LIMIT = { limit: 60, windowSeconds: 60 };

/**
 * Authenticate a v1 API request via Bearer token.
 * Returns the userId if valid, or a NextResponse error.
 */
export async function authenticateApiRequest(
  request: NextRequest
): Promise<{ userId: string } | NextResponse> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header. Use: Bearer rh_..." },
      { status: 401 }
    );
  }

  const apiKey = authHeader.slice(7).trim();
  const result = await validateApiKey(apiKey);

  if (!result) {
    return NextResponse.json(
      { error: "Invalid API key" },
      { status: 401 }
    );
  }

  // Rate limit per user
  const rl = rateLimit(`api-v1:${result.userId}`, API_RATE_LIMIT);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Rate limit exceeded. Max 60 requests/minute." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  return { userId: result.userId };
}
