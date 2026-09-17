import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import {
  claimSocialKitRequest,
  completeSocialKitRequest,
  hashSocialKitRequest,
  isValidIdempotencyKey,
  isValidSourceFingerprint,
  reserveSocialKitRequestBundle,
  SocialKitSchemaUnavailableError,
} from "../social-kit-idempotency";

describe("Social Kit idempotency contract", () => {
  beforeEach(() => rpc.mockReset());

  it("validates bounded keys and SHA-256 source fingerprints", () => {
    expect(isValidIdempotencyKey("12345678")).toBe(true);
    expect(isValidIdempotencyKey("bad key")).toBe(false);
    expect(isValidIdempotencyKey("short")).toBe(false);
    expect(isValidSourceFingerprint("a".repeat(64))).toBe(true);
    expect(isValidSourceFingerprint("A".repeat(64))).toBe(false);
  });

  it("hashes semantic inputs deterministically", () => {
    const input = {
      sourceFingerprint: "a".repeat(64),
      projectId: "project-1",
      locale: "tr" as const,
    };
    expect(hashSocialKitRequest(input)).toBe(hashSocialKitRequest(input));
    expect(hashSocialKitRequest(input)).not.toBe(
      hashSocialKitRequest({ ...input, locale: "en" })
    );
  });

  it("returns an acquired durable request", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          request_id: "request-1",
          disposition: "acquired",
          response_status: null,
          response_body: null,
          response_headers: {},
        },
      ],
      error: null,
    });

    await expect(
      claimSocialKitRequest({
        userId: "user-1",
        idempotencyKey: "request-key-1",
        requestHash: "b".repeat(64),
      })
    ).resolves.toEqual({ disposition: "acquired", requestId: "request-1" });
  });

  it("replays the exact stored response", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          request_id: "request-1",
          disposition: "replay",
          response_status: 402,
          response_body: { error: "insufficient_credits" },
          response_headers: { "Retry-After": "30" },
        },
      ],
      error: null,
    });

    await expect(
      claimSocialKitRequest({
        userId: "user-1",
        idempotencyKey: "request-key-1",
        requestHash: "b".repeat(64),
      })
    ).resolves.toEqual({
      disposition: "replay",
      requestId: "request-1",
      responseStatus: 402,
      responseBody: { error: "insufficient_credits" },
      responseHeaders: { "Retry-After": "30" },
    });
  });

  it("maps a missing PostgREST RPC to a release-safe capability error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function was not found in schema cache" },
    });

    await expect(
      claimSocialKitRequest({
        userId: "user-1",
        idempotencyKey: "request-key-1",
        requestHash: "b".repeat(64),
      })
    ).rejects.toBeInstanceOf(SocialKitSchemaUnavailableError);
  });

  it("reserves a request-bound bundle and maps insufficient balance", async () => {
    const items = [
      { amount: 8, description: "scene" },
      { amount: 35, description: "video" },
    ];
    rpc.mockResolvedValueOnce({ data: ["tx-scene", "tx-video"], error: null });

    await expect(
      reserveSocialKitRequestBundle({
        requestId: "request-1",
        userId: "user-1",
        items,
      })
    ).resolves.toEqual(["tx-scene", "tx-video"]);

    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "insufficient_credits" },
    });
    await expect(
      reserveSocialKitRequestBundle({
        requestId: "request-2",
        userId: "user-1",
        items,
      })
    ).rejects.toMatchObject({ code: "INSUFFICIENT" });
  });

  it("persists the response before it is returned to a caller", async () => {
    rpc.mockResolvedValue({ data: true, error: null });

    await expect(
      completeSocialKitRequest({
        requestId: "request-1",
        userId: "user-1",
        responseStatus: 200,
        responseBody: { jobIds: ["job-1"] },
        responseHeaders: { "Retry-After": "10" },
      })
    ).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("complete_social_kit_request", {
      p_request_id: "request-1",
      p_user_id: "user-1",
      p_response_status: 200,
      p_response_body: { jobIds: ["job-1"] },
      p_response_headers: { "Retry-After": "10" },
    });
  });

  it("rejects a completion RPC that updated zero rows", async () => {
    rpc.mockResolvedValue({ data: false, error: null });

    await expect(
      completeSocialKitRequest({
        requestId: "request-1",
        userId: "user-1",
        responseStatus: 200,
        responseBody: { jobIds: ["job-1"] },
      })
    ).rejects.toThrow("response was not persisted");
  });
});
