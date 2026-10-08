import "server-only";

import { isAdmin } from "@/lib/auth/admin-check";
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/** Shared guards for the admin Model Lab routes. */

export const LAB_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export function labResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: LAB_HEADERS });
}

export function ownRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function sameOrigin(request: NextRequest): boolean {
  try {
    return Boolean(request.headers.get("origin")) && request.headers.get("origin") === new URL(request.url).origin;
  } catch {
    return false;
  }
}

/** A bounded JSON object body, or the error response to return. */
export async function readLabJson(request: NextRequest, maxBytes: number): Promise<Record<string, unknown> | Response> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) return labResponse({ error: "İstek gövdesi çok büyük." }, 413);
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return labResponse({ error: "İstek gövdesi okunamadı." }, 400);
  }
  if (Buffer.byteLength(raw, "utf8") > maxBytes) return labResponse({ error: "İstek gövdesi çok büyük." }, 413);
  try {
    const parsed: unknown = JSON.parse(raw);
    return ownRecord(parsed) ? parsed : labResponse({ error: "Geçersiz istek gövdesi." }, 400);
  } catch {
    return labResponse({ error: "Geçersiz JSON gövdesi." }, 400);
  }
}

/**
 * The signed-in admin, or the 403 to return. State-changing requests also
 * require the same origin.
 */
export async function requireLabAdmin(
  request: NextRequest,
  options: { sameOrigin: boolean }
): Promise<{ id: string; email?: string } | Response> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdmin(user.email)) return labResponse({ error: "Bu işlem için yönetici yetkisi gerekiyor." }, 403);
  if (options.sameOrigin && !sameOrigin(request)) {
    return labResponse({ error: "İstek yalnızca aynı Renderhane adresinden yapılabilir." }, 403);
  }
  return user;
}
