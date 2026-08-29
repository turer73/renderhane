import { NextRequest, NextResponse } from "next/server";

/**
 * The browser-facing fal proxy is intentionally disabled. All model calls
 * must pass through submitJob/submitJobSync so model allowlists, credit
 * reservation, idempotency and audit records cannot be bypassed.
 */
function disabledResponse() {
  return NextResponse.json(
    { error: "Direct AI proxy access is disabled" },
    { status: 410 }
  );
}

export async function GET(_request: NextRequest) {
  void _request;
  return disabledResponse();
}

export async function POST(_request: NextRequest) {
  void _request;
  return disabledResponse();
}

export async function PUT(_request: NextRequest) {
  void _request;
  return disabledResponse();
}
