import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { issueModelLabReceipt, MODEL_LAB_RECEIPT_TTL_MS, verifyModelLabReceipt } from "../model-lab-receipt";

const fields = { userId: "admin-1", modelKey: "meshy", endpoint: "fal-ai/meshy", requestId: "request-1" };
const secret = "test-receipt-secret";
const now = 1_700_000_000_000;

describe("model lab receipt", () => {
  it("binds the receipt to its exact claims and expires after 24 hours", () => {
    const receipt = issueModelLabReceipt(fields, secret, now);
    expect(verifyModelLabReceipt(receipt, secret, now)).toMatchObject(fields);
    expect(verifyModelLabReceipt(receipt, secret, now + MODEL_LAB_RECEIPT_TTL_MS)).toBeNull();
  });

  it("rejects a tampered payload or signature", () => {
    const receipt = issueModelLabReceipt(fields, secret, now);
    const [payload, signature] = receipt.split(".");
    expect(verifyModelLabReceipt(`${payload}x.${signature}`, secret, now)).toBeNull();
    expect(verifyModelLabReceipt(`${payload}.${signature.slice(0, -1)}x`, secret, now)).toBeNull();
  });

  it("does not accept prototype or extra claims", () => {
    const payload = Buffer.from(JSON.stringify({ ...fields, issuedAt: now, expiresAt: now + MODEL_LAB_RECEIPT_TTL_MS, extra: true })).toString("base64url");
    const valid = issueModelLabReceipt(fields, secret, now);
    expect(verifyModelLabReceipt(`${payload}.${valid.split(".")[1]}`, secret, now)).toBeNull();
  });
});
