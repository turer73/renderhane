import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRemeshToken, verifyRemeshToken } from "../remesh-token";

describe("remesh status token", () => {
  beforeEach(() => { process.env.FAL_WEBHOOK_SECRET = "test-secret"; });
  afterEach(() => { delete process.env.FAL_WEBHOOK_SECRET; });

  it("verifies only for the same user and request", () => {
    const token = createRemeshToken("user-1", "req-1");
    expect(verifyRemeshToken("user-1", "req-1", token)).toBe(true);
    expect(verifyRemeshToken("user-2", "req-1", token)).toBe(false);
    expect(verifyRemeshToken("user-1", "req-2", token)).toBe(false);
  });

  it("rejects missing and malformed tokens", () => {
    expect(verifyRemeshToken("user-1", "req-1", null)).toBe(false);
    expect(verifyRemeshToken("user-1", "req-1", "")).toBe(false);
    expect(verifyRemeshToken("user-1", "req-1", "not-a-token")).toBe(false);
  });
});
