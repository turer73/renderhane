import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock("@/lib/credits/engine", () => ({
  refundCredits: mocks.refundCredits,
}));

import { GET } from "../route";

function resolvedChain<T>(result: T) {
  const chain = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    lt: vi.fn(),
    limit: vi.fn(),
  };
  chain.select.mockReturnValue(chain);
  chain.eq.mockReturnValue(chain);
  chain.in.mockReturnValue(chain);
  chain.lt.mockReturnValue(chain);
  chain.limit.mockResolvedValue(result);
  return chain;
}

describe("stuck-jobs orphan reservation cleanup", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "cron-secret";
    mocks.refundCredits.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  });

  it("refunds only old reservations that have no linked job", async () => {
    const stuckJobs = resolvedChain({ data: [], error: null });
    const reservations = resolvedChain({
      data: [{ id: "tx-orphan" }, { id: "tx-linked" }],
      error: null,
    });
    const linkedJobs = resolvedChain({
      data: [{ credit_tx_id: "tx-linked" }],
      error: null,
    });
    linkedJobs.in.mockResolvedValue({
      data: [{ credit_tx_id: "tx-linked" }],
      error: null,
    });

    let jobsQueryCount = 0;
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "credit_transactions") return reservations;
        jobsQueryCount++;
        return jobsQueryCount === 1 ? stuckJobs : linkedJobs;
      }),
    });

    const response = await GET(
      new NextRequest("https://renderhane.com/api/cron/stuck-jobs", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      cleaned: 0,
      refunded: 0,
      orphanRefunded: 1,
    });
    expect(mocks.refundCredits).toHaveBeenCalledOnce();
    expect(mocks.refundCredits).toHaveBeenCalledWith("tx-orphan");
  });

  it("fails closed when reservation linkage cannot be verified", async () => {
    const stuckJobs = resolvedChain({ data: [], error: null });
    const reservations = resolvedChain({
      data: [{ id: "tx-unknown" }],
      error: null,
    });
    const linkedJobs = resolvedChain({
      data: null,
      error: { message: "database unavailable" },
    });
    linkedJobs.in.mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    let jobsQueryCount = 0;
    mocks.createAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "credit_transactions") return reservations;
        jobsQueryCount++;
        return jobsQueryCount === 1 ? stuckJobs : linkedJobs;
      }),
    });

    const response = await GET(
      new NextRequest("https://renderhane.com/api/cron/stuck-jobs", {
        headers: { authorization: "Bearer cron-secret" },
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ orphanRefunded: 0 });
    expect(mocks.refundCredits).not.toHaveBeenCalled();
  });
});
