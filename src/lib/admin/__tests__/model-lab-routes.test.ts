import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), rateLimit: vi.fn(), submit: vi.fn(),
  subscribe: vi.fn(), status: vi.fn(), result: vi.fn(), build: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {}, general: {} } }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ submit: mocks.submit, subscribe: mocks.subscribe, status: mocks.status, result: mocks.result }) }));
vi.mock("@/lib/admin/model-lab-catalog", () => ({ buildLabInput: mocks.build }));
vi.mock("@/lib/fal/models", () => ({ MODELS: { "test-model": { id: "fal-ai/test" } } }));

import { POST as submit } from "@/app/api/admin/models/test/route";
import { POST as status } from "@/app/api/admin/models/test/status/route";
import { issueModelLabReceipt, MODEL_LAB_RECEIPT_TTL_MS } from "../model-lab-receipt";

const secret = "receipt-test-secret";
const user = { id: "admin-a", email: "admin@example.test" };
function request(url: string, body: unknown, origin = true) {
  return new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin: new URL(url).origin } : {}) }, body: JSON.stringify(body) });
}
async function json(response: Response) { return response.json() as Promise<Record<string, unknown>>; }
function receipt(forUser = user.id, now = Date.now()) { return issueModelLabReceipt({ userId: forUser, modelKey: "test-model", endpoint: "fal-ai/test", requestId: "request-1" }, secret, now); }

describe("admin model lab routes", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FAL_WEBHOOK_SECRET", secret);
    mocks.getUser.mockResolvedValue({ data: { user } });
    mocks.isAdmin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.build.mockReturnValue({ prompt: "test" });
    mocks.submit.mockResolvedValue({ requestId: "request-1" });
    mocks.status.mockResolvedValue({ status: "IN_QUEUE" });
  });

  it("unauthenticated and non-admin requests are forbidden before provider calls", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await submit(request("https://renderhane.test/api/admin/models/test", {}))).status).toBe(403);
    mocks.getUser.mockResolvedValueOnce({ data: { user } }); mocks.isAdmin.mockReturnValueOnce(false);
    expect((await submit(request("https://renderhane.test/api/admin/models/test", {}))).status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("rejects missing consent, unknown/prototype model names, and invalid values", async () => {
    const url = "https://renderhane.test/api/admin/models/test";
    expect((await submit(request(url, { modelKey: "test-model", values: {}, confirmProviderSpend: false }))).status).toBe(400);
    expect((await submit(request(url, { modelKey: "toString", values: {}, confirmProviderSpend: true }))).status).toBe(400);
    expect((await submit(request(url, { modelKey: "test-model", values: { prompt: 12 }, confirmProviderSpend: true }))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("requires secret before spend and admits only a raw queue submission", async () => {
    const url = "https://renderhane.test/api/admin/models/test";
    delete process.env.FAL_WEBHOOK_SECRET;
    expect((await submit(request(url, { modelKey: "test-model", values: {}, confirmProviderSpend: true }))).status).toBe(503);
    expect(mocks.submit).not.toHaveBeenCalled();
    process.env.FAL_WEBHOOK_SECRET = secret;
    const response = await submit(request(url, { modelKey: "test-model", values: { prompt: "x" }, confirmProviderSpend: true }));
    expect(response.status).toBe(202);
    expect(await json(response)).toMatchObject({ requestId: "request-1", modelKey: "test-model", status: "IN_QUEUE" });
    expect(mocks.submit).toHaveBeenCalledWith("fal-ai/test", { prompt: "test" });
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous queue failure and returns a recoverable receipt", async () => {
    const error = Object.assign(new Error("lost acknowledgement"), { requestId: "request-1" });
    mocks.submit.mockRejectedValueOnce(error);
    const response = await submit(request("https://renderhane.test/api/admin/models/test", { modelKey: "test-model", values: {}, confirmProviderSpend: true }));
    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ submissionUncertain: true, requestId: "request-1" });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("accepts a valid receipt and never submits while polling", async () => {
    const response = await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() }));
    expect(response.status).toBe(200); expect(await json(response)).toEqual({ status: "IN_QUEUE" });
    expect(mocks.status).toHaveBeenCalledWith("fal-ai/test", "request-1");
    expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("rejects another user's, tampered, and expired receipts", async () => {
    const url = "https://renderhane.test/api/admin/models/test/status";
    expect((await status(request(url, { receipt: receipt("admin-b") }))).status).toBe(403);
    const valid = receipt();
    expect((await status(request(url, { receipt: `${valid}x` }))).status).toBe(403);
    const expired = receipt(user.id, Date.now() - MODEL_LAB_RECEIPT_TTL_MS - 1);
    expect((await status(request(url, { receipt: expired }))).status).toBe(403);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("filters malicious completed output URLs", async () => {
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockResolvedValueOnce({ image: { url: "https://cdn.example/image.png" }, model_mesh: { url: "http://bad.example/a.glb" }, images: [{ url: "https://127.0.0.1/private.png" }, { url: "https://cdn.example/second.png" }], result_url: "javascript:alert(1)" });
    const response = await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() }));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ status: "COMPLETED", outputs: [{ url: "https://cdn.example/image.png", kind: "image" }, { url: "https://cdn.example/second.png", kind: "image" }] });
  });

  it("keeps a receipt on transient status errors without automatic resubmission", async () => {
    mocks.status.mockRejectedValueOnce(new Error("temporary"));
    const activeReceipt = receipt();
    const response = await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: activeReceipt }));
    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ retryable: true, receipt: activeReceipt });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("requires admin and same-origin checks for status too", async () => {
    const url = "https://renderhane.test/api/admin/models/test/status";
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await status(request(url, { receipt: receipt() }))).status).toBe(403);
    mocks.isAdmin.mockReturnValueOnce(false);
    expect((await status(request(url, { receipt: receipt() }))).status).toBe(403);
    expect((await status(request(url, { receipt: receipt() }, false))).status).toBe(403);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, oversized, extra-field and rejected-input submissions", async () => {
    const url = "https://renderhane.test/api/admin/models/test";
    const body = { modelKey: "test-model", values: {}, confirmProviderSpend: true };
    expect((await submit(request(url, body, false))).status).toBe(403);
    expect((await submit(new NextRequest(url, { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify(body) }))).status).toBe(403);
    expect((await submit(request(url, { ...body, values: { prompt: "x".repeat(33000) } }))).status).toBe(413);
    expect((await submit(request(url, { ...body, endpoint: "arbitrary/provider" }))).status).toBe(400);
    mocks.build.mockImplementationOnce(() => { throw new Error("invalid"); });
    expect((await submit(request(url, body))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("enforces rate limits before either paid or status provider requests", async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect((await submit(request("https://renderhane.test/api/admin/models/test", { modelKey: "test-model", values: {}, confirmProviderSpend: true }))).status).toBe(429);
    expect((await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() }))).status).toBe(429);
    expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.status).not.toHaveBeenCalled();
  });

  it("never invents a receipt for an unacknowledged submission", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("secret provider details"));
    const data = await json(await submit(request("https://renderhane.test/api/admin/models/test", { modelKey: "test-model", values: {}, confirmProviderSpend: true })));
    expect(data.submissionUncertain).toBe(true); expect(data).not.toHaveProperty("receipt");
    expect(JSON.stringify(data)).not.toContain("secret provider details");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("unknown states and temporarily unavailable results pause rather than resubmit", async () => {
    const activeReceipt = receipt();
    const url = "https://renderhane.test/api/admin/models/test/status";
    mocks.status.mockResolvedValueOnce({ status: "SOMETHING_NEW" });
    expect(await json(await status(request(url, { receipt: activeReceipt })))).toMatchObject({ retryable: true, receipt: activeReceipt });
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" }); mocks.result.mockRejectedValueOnce(new Error("unavailable"));
    expect(await json(await status(request(url, { receipt: activeReceipt })))).toMatchObject({ retryable: true, receipt: activeReceipt });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("preserves terminal failure without pretending to have an output", async () => {
    mocks.status.mockResolvedValueOnce({ status: "FAILED" });
    expect(await json(await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() })))).toMatchObject({ status: "FAILED", terminal: true });
    expect(mocks.result).not.toHaveBeenCalled();
  });

  it.each([
    { error: "Voice input was rejected", error_type: "UserError" },
    { error: "Model rejected the input" },
    { error_type: "UserError" },
  ])("treats Fal COMPLETED plus error metadata as terminal without fetching a result: %j", async (failure) => {
    mocks.status.mockResolvedValueOnce({
      status: "COMPLETED",
      ...failure,
    });
    const response = await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() }));
    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      status: "FAILED",
      error: "Sağlayıcı işi tamamlayamadı.",
      terminal: true,
    });
    expect(mocks.result).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("supports the existing GLB, mesh and generic output contracts without traversing arbitrary links", async () => {
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockResolvedValueOnce({ glb: { url: "https://cdn.example/a.glb" }, mesh: { url: "https://cdn.example/a.obj" }, output: { url: "https://cdn.example/result.zip" }, unrelated: { url: "https://cdn.example/private" } });
    expect(await json(await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() })))).toEqual({ status: "COMPLETED", outputs: [
      { url: "https://cdn.example/a.glb", kind: "glb" }, { url: "https://cdn.example/a.obj", kind: "file" }, { url: "https://cdn.example/result.zip", kind: "file" },
    ] });
  });

  it("extracts a safe F5-TTS audio_url string", async () => {
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockResolvedValueOnce({ audio_url: "https://cdn.example/f5-output.wav" });
    expect(await json(await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() })))).toEqual({
      status: "COMPLETED",
      outputs: [{ url: "https://cdn.example/f5-output.wav", kind: "audio" }],
    });
  });

  it("extracts a safe F5-TTS audio_url object", async () => {
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockResolvedValueOnce({ audio_url: { url: "https://cdn.example/f5-output.wav" } });
    expect(await json(await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() })))).toEqual({
      status: "COMPLETED",
      outputs: [{ url: "https://cdn.example/f5-output.wav", kind: "audio" }],
    });
  });

  it("rejects unsafe F5-TTS audio_url and deduplicates duplicate audio fields", async () => {
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockResolvedValueOnce({
      audio_url: { url: "https://127.0.0.1/private.wav" },
      audio: { url: "https://cdn.example/f5-output.wav" },
      result_url: "https://cdn.example/f5-output.wav",
    });
    expect(await json(await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() })))).toEqual({
      status: "COMPLETED",
      outputs: [{ url: "https://cdn.example/f5-output.wav", kind: "audio" }],
    });
  });

  it.each(["https://169.254.169.254/a", "https://[::ffff:127.0.0.1]/a", "https://host.local./a", "https://host.internal/a", "https://localhost./a", "https://user:pass@cdn.example/a"])("rejects unsafe result address %s", async (url) => {
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" }); mocks.result.mockResolvedValueOnce({ result_url: url });
    expect(await json(await status(request("https://renderhane.test/api/admin/models/test/status", { receipt: receipt() })))).toEqual({ status: "COMPLETED", outputs: [] });
  });
});
