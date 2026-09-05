import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/referral/complete", () => ({
  completeReferral: vi.fn(),
}));

import { GET } from "@/app/[locale]/(auth)/auth/callback/route";

describe("auth callback origin isolation", () => {
  it.each([
    "https://www.renderhane.com",
    "https://renderhane-preview.example.vercel.app",
  ])("keeps missing-code redirects on %s", async (origin) => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://www.renderhane.com");

    const response = await GET(
      new NextRequest(`${origin}/tr/auth/callback`),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `${origin}/tr/login?error=missing_code`,
    );
  });
});
