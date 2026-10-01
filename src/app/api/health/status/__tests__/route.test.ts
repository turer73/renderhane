import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), single: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
import { GET } from "../route";

describe("verified public health status", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    const query = { select: vi.fn(), eq: vi.fn(), single: mocks.single };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    mocks.createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    mocks.single.mockResolvedValue({ data: { is_healthy: true }, error: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([true, false])("returns confirmed provider status %s and clears the timeout", async (healthy) => {
    mocks.single.mockResolvedValue({ data: { is_healthy: healthy }, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ healthy });
    expect(response.headers.get("cache-control")).toContain("s-maxage=30");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { data: null, error: { message: "unavailable" } },
    { data: { is_healthy: true }, error: { message: "unavailable" } },
    { data: null, error: null },
    { data: { is_healthy: null }, error: null },
    { data: { is_healthy: "true" }, error: null },
  ])("does not report an errored or unverified result as healthy: %j", async (result) => {
    mocks.single.mockResolvedValue(result);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ healthy: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns an uncached 503 when credentials are missing without exposing the error", async () => {
    mocks.createAdminClient.mockImplementation(() => { throw new Error("missing secret credentials"); });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ healthy: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles a rejected query without a false healthy response", async () => {
    mocks.single.mockRejectedValue(new Error("connection unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ healthy: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns an uncached 503 when the database check exceeds five seconds", async () => {
    mocks.single.mockReturnValue(new Promise(() => {}));
    const pending = GET();
    await vi.advanceTimersByTimeAsync(5000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ healthy: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(vi.getTimerCount()).toBe(0);
  });
});
