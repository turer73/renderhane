import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getResend: vi.fn(),
  emailSend: vi.fn(),
  statusSingle: vi.fn(),
  statusUpdate: vi.fn(),
  statusUpdateEq: vi.fn(),
  statusUpdateSelect: vi.fn(),
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

function stubHealthyFal() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ models: [{ endpoint_id: "fal-ai/birefnet/v2" }] }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    )
  );
}

function summaryLines(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith("[health] summary "));
}

describe("GET /api/cron/health", () => {
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.CRON_SECRET = "cron-secret";
    process.env.FAL_KEY = "test-fal-key";
    process.env.ADMIN_EMAILS = "";

    mocks.statusSingle.mockResolvedValue({
      data: { is_healthy: true, consecutive_failures: 0 },
      error: null,
    });
    mocks.statusUpdateSelect.mockResolvedValue({ data: [{ id: "fal-ai" }], error: null });
    mocks.statusUpdateEq.mockReturnValue({ select: mocks.statusUpdateSelect });
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

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
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

  it("logs exactly one summary line that matches the stored response", async () => {
    stubHealthyFal();

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ healthy: true, stored: true });
    const lines = summaryLines(log);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice("[health] summary ".length))).toEqual(body);
    expect(error).not.toHaveBeenCalled();
  });

  it("reports an unhealthy provider as 200 once its receipt is stored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    const response = await GET(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ healthy: false, stored: true });
  });

  it("returns 503 when the status row is missing, because nothing was recorded", async () => {
    stubHealthyFal();
    mocks.statusUpdateSelect.mockResolvedValue({ data: [], error: null });

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ healthy: true, stored: false });
    expect(error).toHaveBeenCalledWith("[health] system_status update failed:", "0 rows updated");
    expect(summaryLines(log)).toHaveLength(1);
  });

  it("returns 503 when the health log row cannot be stored", async () => {
    stubHealthyFal();
    mocks.healthInsert.mockResolvedValue({ error: { message: "insert denied" } });

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ stored: false });
    expect(error).toHaveBeenCalledWith("[health] system_health_logs insert failed:", "insert denied");
  });

  it("writes nothing and sends no alert when the stored state cannot be read", async () => {
    stubHealthyFal();
    process.env.ADMIN_EMAILS = "admin@example.com";
    mocks.statusSingle.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    const response = await GET(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ stored: false, statusChanged: false });
    expect(error).toHaveBeenCalledWith("[health] system_status read failed:", "database unavailable");
    expect(mocks.statusUpdate).not.toHaveBeenCalled();
    expect(mocks.healthInsert).not.toHaveBeenCalled();
    expect(mocks.emailSend).not.toHaveBeenCalled();
  });
});
