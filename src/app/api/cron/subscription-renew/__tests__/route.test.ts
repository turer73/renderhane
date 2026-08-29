import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/lib/email/resend", () => ({
  getResend: vi.fn(),
  FROM_EMAIL: "test@example.com",
}));

import { GET } from "../route";

describe("subscription renewal cron authorization", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it("fails closed when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const request = new NextRequest("https://renderhane.com/api/cron/subscription-renew", {
      headers: { authorization: "Bearer undefined" },
    });

    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an incorrect bearer token", async () => {
    process.env.CRON_SECRET = "configured-secret";
    const request = new NextRequest("https://renderhane.com/api/cron/subscription-renew", {
      headers: { authorization: "Bearer wrong-secret" },
    });

    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
