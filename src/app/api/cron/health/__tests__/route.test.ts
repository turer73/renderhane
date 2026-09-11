import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getResend: vi.fn(),
  emailSend: vi.fn(),
  statusSingle: vi.fn(),
  statusUpdate: vi.fn(),
  statusUpdateEq: vi.fn(),
  healthInsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/email/resend", () => ({
  getResend: mocks.getResend,
  FROM_EMAIL: "Renderhane <test@example.com>",
}));
vi.mock("@/lib/email/templates/health-alert", () => ({
  buildServiceDownEmail: () => ({ subject: "down", html: "down" }),
  buildServiceRecoveredEmail: () => ({ subject: "up", html: "up" }),
}));

import { GET } from "../route";

function request(secret = "cron-secret") {
  return new NextRequest("https://renderhane.com/api/cron/health", {
    headers: { authorization: `Bearer ${secret}` },
  });
}

describe("GET /api/cron/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    process.env.FAL_KEY = "test-fal-key";
    process.env.ADMIN_EMAILS = "";

    mocks.statusSingle.mockResolvedValue({
      data: { is_healthy: true, consecutive_failures: 0 },
      error: null,
    });
    mocks.statusUpdateEq.mockResolvedValue({ error: null });
    mocks.healthInsert.mockResolvedValue({ error: null });
    mocks.statusUpdate.mockReturnValue({ eq: mocks.statusUpdateEq });

    const statusSelect = {
      eq: vi.fn(() => ({ single: mocks.statusSingle })),
    };
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "system_status") {
          return {
            select: vi.fn(() => statusSelect),
            update: mocks.statusUpdate,
          };
        }
        if (table === "system_health_logs") {
          return { insert: mocks.healthInsert };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    });
    mocks.getResend.mockReturnValue({ emails: { send: mocks.emailSend } });
  });

  it("checks authenticated model metadata without opening inference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ endpoint_id: "fal-ai/birefnet/v2" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      service: "fal-ai",
      check: "platform_model_metadata",
      healthy: true,
      statusChanged: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.fal.ai/v1/models?endpoint_id=fal-ai%2Fbirefnet%2Fv2&limit=1",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Key test-fal-key" },
        cache: "no-store",
      })
    );
    expect(mocks.statusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ is_healthy: true, consecutive_failures: 0 })
    );
  });

  it("records an authentication failure without submitting a model request", async () => {
    mocks.statusSingle.mockResolvedValue({
      data: { is_healthy: false, consecutive_failures: 2 },
      error: null,
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({
      healthy: false,
      statusChanged: false,
    });
    expect(mocks.statusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_healthy: false,
        consecutive_failures: 3,
        last_error: "fal.ai platform check returned HTTP 401",
      })
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the Fal key is missing", async () => {
    delete process.env.FAL_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request());

    await expect(response.json()).resolves.toMatchObject({ healthy: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.statusUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ last_error: "FAL_KEY is not configured" })
    );
  });
});
