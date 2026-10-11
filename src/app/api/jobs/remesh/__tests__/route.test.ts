import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rateLimit: vi.fn(),
  submit: vi.fn(),
  reserveCredits: vi.fn(),
  refundCredits: vi.fn(),
  confirmSpend: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { remesh: {} } }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ submit: mocks.submit }) }));
vi.mock("@/lib/credits/engine", () => ({
  reserveCredits: mocks.reserveCredits,
  refundCredits: mocks.refundCredits,
  confirmSpend: mocks.confirmSpend,
}));

import { POST } from "../route";
import { REMESH_CREDITS } from "@/lib/jobs/remesh-token";

const OUTPUT = { id: "out-1", job_id: "job-1", type: "glb", fal_url: null, r2_url: "https://assets.renderhane.com/outputs/u/m.glb", user_id: "user-1" };

function remesh() {
  return POST(new NextRequest("https://renderhane.com/api/jobs/remesh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ outputId: "out-1" }),
  }));
}

describe("POST /api/jobs/remesh billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FAL_WEBHOOK_SECRET = "test-secret";
    const single = vi.fn().mockResolvedValue({ data: OUTPUT, error: null });
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })),
    });
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.reserveCredits.mockResolvedValue("tx-1");
    mocks.submit.mockResolvedValue({ requestId: "fal-1" });
  });

  it("reserves before the paid call and settles the charge on the model's job", async () => {
    const response = await remesh();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ requestId: "fal-1", creditCost: REMESH_CREDITS, status: "processing" });
    expect(mocks.reserveCredits).toHaveBeenCalledWith("user-1", REMESH_CREDITS, expect.stringContaining("out-1"));
    expect(mocks.reserveCredits.mock.invocationCallOrder[0]).toBeLessThan(mocks.submit.mock.invocationCallOrder[0]);
    expect(mocks.confirmSpend).toHaveBeenCalledWith("tx-1", "job-1");
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });

  it("returns 402 without calling fal when the balance is too low", async () => {
    mocks.reserveCredits.mockRejectedValueOnce(Object.assign(new Error("Insufficient credits"), { name: "CreditError", code: "INSUFFICIENT" }));
    const response = await remesh();
    expect(response.status).toBe(402);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("refunds when fal rejects the submission", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("fal down"));
    const response = await remesh();
    expect(response.status).toBe(500);
    expect(mocks.refundCredits).toHaveBeenCalledWith("tx-1");
    expect(mocks.confirmSpend).not.toHaveBeenCalled();
  });
});
