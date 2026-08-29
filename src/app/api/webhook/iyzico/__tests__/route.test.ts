import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  retrieve: vi.fn(),
  verifyBasketId: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ rpc: mocks.rpc }),
}));

vi.mock("@/lib/payments/iyzico", () => ({
  PACKAGES: {
    starter: { name: "Starter", credits: 100 },
  },
  isValidPackageKey: (key: string) => key === "starter",
  retrieveCheckoutFormResult: mocks.retrieve,
  verifyBasketId: mocks.verifyBasketId,
}));

import { POST } from "../route";

function webhookRequest(body: unknown): NextRequest {
  return new NextRequest("https://renderhane.com/api/webhook/iyzico", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("iyzico webhook retry behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.retrieve.mockResolvedValue({
      paymentStatus: "SUCCESS",
      basketId: "signed-basket",
      paymentId: "payment-1",
    });
    mocks.verifyBasketId.mockReturnValue({
      userId: "user-1",
      packageKey: "starter",
      locale: "tr",
    });
    mocks.rpc.mockResolvedValue({ data: "tx-1", error: null });
  });

  it("acknowledges malformed permanent payloads", async () => {
    const response = await POST(webhookRequest({ nope: true }));
    expect(response.status).toBe(200);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("returns 503 when iyzico verification is temporarily unavailable", async () => {
    mocks.retrieve.mockRejectedValue(new Error("provider unavailable"));
    const response = await POST(webhookRequest({ token: "token-1" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("900");
  });

  it("returns 503 when the idempotent credit write fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });
    const response = await POST(webhookRequest({ token: "token-1" }));
    expect(response.status).toBe(503);
  });

  it("acknowledges a successful or duplicate credit write", async () => {
    const response = await POST(webhookRequest({ token: "token-1" }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("add_credits", expect.objectContaining({
      p_user_id: "user-1",
      p_payment_id: "payment-1",
      p_amount: 100,
    }));
  });
});
