import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  runScan: vi.fn(),
  getResend: vi.fn(),
  emailSend: vi.fn(),
  scanInsert: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/fal/scanner", () => ({
  runScan: mocks.runScan,
}));
vi.mock("@/lib/email/resend", () => ({
  getResend: mocks.getResend,
  FROM_EMAIL: "Renderhane <test@example.com>",
}));

import { GET } from "../route";

function cronRequest() {
  return new NextRequest("https://renderhane.com/api/cron/fal-scanner", {
    headers: { authorization: "Bearer cron-secret" },
  });
}

function scanResult(alerts: unknown[] = []) {
  return {
    scannedAt: "2026-10-05T09:00:00.000Z",
    totalModelsChecked: 3,
    activeCount: 2,
    errorCount: 1,
    newModelsFound: 0,
    endpointChecks: [],
    newModels: [],
    alerts,
  };
}

function summaryLines(log: { mock: { calls: unknown[][] } }) {
  return log.mock.calls
    .map(([line]) => String(line))
    .filter((line) => line.startsWith("[fal-scanner-cron] summary "));
}

describe("GET /api/cron/fal-scanner", () => {
  const originalSecret = process.env.CRON_SECRET;
  let log: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    process.env.ADMIN_EMAILS = "";
    log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.runScan.mockResolvedValue(scanResult());
    mocks.scanInsert.mockResolvedValue({ error: null });
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "fal_scan_results") return { insert: mocks.scanInsert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    });
    mocks.getResend.mockReturnValue({ emails: { send: mocks.emailSend } });
  });

  afterEach(() => {
    log.mockRestore();
    error.mockRestore();
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("stores the scan and logs exactly one summary line", async () => {
    const response = await GET(cronRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ totalModelsChecked: 3, errorCount: 1, stored: true });
    expect(mocks.scanInsert).toHaveBeenCalledWith(
      expect.objectContaining({ scanned_at: "2026-10-05T09:00:00.000Z", total_models_checked: 3 })
    );
    const lines = summaryLines(log);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice("[fal-scanner-cron] summary ".length))).toEqual(body);
  });

  it("returns 503 when the scan result cannot be stored, but still sends alerts", async () => {
    process.env.ADMIN_EMAILS = "admin@example.com";
    mocks.runScan.mockResolvedValue(
      scanResult([
        { type: "endpoint_down", severity: "critical", endpoint: "fal-ai/x", message: "x is down" },
      ])
    );
    mocks.scanInsert.mockResolvedValue({ error: { message: "permission denied" } });

    const response = await GET(cronRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ stored: false, criticalAlerts: 1 });
    expect(error).toHaveBeenCalledWith(
      "[fal-scanner-cron] fal_scan_results insert failed:",
      "permission denied"
    );
    expect(mocks.emailSend).toHaveBeenCalledTimes(1);
    expect(summaryLines(log)).toHaveLength(1);
  });

  it("rejects a request without the cron secret before scanning", async () => {
    const response = await GET(new NextRequest("https://renderhane.com/api/cron/fal-scanner"));

    expect(response.status).toBe(401);
    expect(mocks.runScan).not.toHaveBeenCalled();
  });
});
