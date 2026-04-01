import { NextResponse } from "next/server";

/**
 * Ultra-lightweight ping endpoint for uptime monitoring.
 *
 * NO database calls, NO external services — just proves the
 * Vercel function is alive and responding. Use this URL in
 * your monitoring tool instead of the root domain.
 *
 * Target: < 50ms response time (even on cold start).
 */
export async function GET() {
  return NextResponse.json(
    { status: "ok", ts: Date.now() },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
