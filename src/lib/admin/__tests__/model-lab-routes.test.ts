import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeLabAdmin } from "./fake-lab-admin";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), rateLimit: vi.fn(), submit: vi.fn(),
  subscribe: vi.fn(), status: vi.fn(), result: vi.fn(), build: vi.fn(),
  openPublicDownload: vi.fn(), adminClient: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.adminClient }));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {}, general: {} } }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ submit: mocks.submit, subscribe: mocks.subscribe, status: mocks.status, result: mocks.result }) }));
vi.mock("@/lib/admin/model-lab-catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/model-lab-catalog")>()),
  buildLabInput: mocks.build,
}));
vi.mock("@/lib/security/safe-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/safe-download")>()),
  openPublicDownload: mocks.openPublicDownload,
}));

import { POST as submit } from "@/app/api/admin/models/test/route";
import { POST as status } from "@/app/api/admin/models/test/status/route";
import { extractLabOutputs } from "../model-lab-storage";
import { issueModelLabReceipt, MODEL_LAB_RECEIPT_TTL_MS } from "../model-lab-receipt";

// A text-only model, so these route tests never reach the image preflight.
const MODEL = "ideogram-v4";
const ENDPOINT = "ideogram/v4";
const secret = "receipt-test-secret";
const user = { id: "admin-a", email: "admin@example.test" };
const SUBMIT_URL = "https://renderhane.test/api/admin/models/test";
const STATUS_URL = "https://renderhane.test/api/admin/models/test/status";
let fake: ReturnType<typeof createFakeLabAdmin>;

function request(url: string, body: unknown, origin = true) {
  return new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin: new URL(url).origin } : {}) }, body: JSON.stringify(body) });
}
type LabBody = Record<string, unknown> & { run: Record<string, unknown> & { id: string; outputs: unknown[] } };
async function json(response: Response) { return response.json() as Promise<LabBody>; }
function receipt(forUser = user.id, now = Date.now()) { return issueModelLabReceipt({ userId: forUser, modelKey: MODEL, endpoint: ENDPOINT, requestId: "request-1" }, secret, now); }
function submission(extra: Record<string, unknown> = {}) {
  return { modelKey: MODEL, values: {}, confirmProviderSpend: true, clientRequestId: crypto.randomUUID(), ...extra };
}
/** A queued run created through the real submit route. */
async function queuedRun(): Promise<string> {
  const response = await submit(request(SUBMIT_URL, submission()));
  expect(response.status).toBe(202);
  return (await json(response)).run.id;
}

describe("admin model lab routes", () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FAL_WEBHOOK_SECRET", secret);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    fake = createFakeLabAdmin();
    mocks.adminClient = fake.client;
    mocks.getUser.mockResolvedValue({ data: { user } });
    mocks.isAdmin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.build.mockReturnValue({ prompt: "test" });
    mocks.submit.mockResolvedValue({ requestId: "request-1" });
    mocks.status.mockResolvedValue({ status: "IN_QUEUE" });
    mocks.openPublicDownload.mockRejectedValue(new Error("offline"));
  });

  it("unauthenticated and non-admin requests are forbidden before provider calls", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await submit(request(SUBMIT_URL, submission()))).status).toBe(403);
    mocks.getUser.mockResolvedValueOnce({ data: { user } }); mocks.isAdmin.mockReturnValueOnce(false);
    expect((await submit(request(SUBMIT_URL, submission()))).status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(0);
  });

  it("rejects missing consent, unknown/prototype model names, invalid values and a missing attempt id", async () => {
    expect((await submit(request(SUBMIT_URL, submission({ confirmProviderSpend: false })))).status).toBe(400);
    expect((await submit(request(SUBMIT_URL, submission({ modelKey: "toString" })))).status).toBe(400);
    expect((await submit(request(SUBMIT_URL, submission({ values: { prompt: 12 } })))).status).toBe(400);
    expect((await submit(request(SUBMIT_URL, submission({ clientRequestId: undefined })))).status).toBe(400);
    expect((await submit(request(SUBMIT_URL, submission({ clientRequestId: "not-a-uuid" })))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(0);
  });

  it("requires secret before spend and admits only a raw queue submission", async () => {
    vi.stubEnv("FAL_WEBHOOK_SECRET", "");
    expect((await submit(request(SUBMIT_URL, submission()))).status).toBe(503);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(0);
    vi.stubEnv("FAL_WEBHOOK_SECRET", secret);
    const response = await submit(request(SUBMIT_URL, submission({ values: { prompt: "x" } })));
    expect(response.status).toBe(202);
    expect(await json(response)).toMatchObject({ requestId: "request-1", modelKey: MODEL, status: "IN_QUEUE", run: { status: "queued", requestId: "request-1" } });
    expect(mocks.submit).toHaveBeenCalledWith(ENDPOINT, { prompt: "test" });
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("does not retry an ambiguous queue failure and returns a recoverable receipt", async () => {
    const error = Object.assign(new Error("lost acknowledgement"), { requestId: "request-1" });
    mocks.submit.mockRejectedValueOnce(error);
    const response = await submit(request(SUBMIT_URL, submission()));
    expect(response.status).toBe(502);
    const body = await json(response);
    expect(body).toMatchObject({ submissionUncertain: true, requestId: "request-1", run: { status: "queued" } });
    expect(typeof body.receipt).toBe("string");
    expect(JSON.stringify(body)).not.toContain("lost acknowledgement");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("polls a run by id and never submits while polling", async () => {
    const runId = await queuedRun();
    const response = await status(request(STATUS_URL, { runId }));
    expect(response.status).toBe(200);
    expect((await json(response)).run).toMatchObject({ id: runId, status: "queued" });
    expect(mocks.status).toHaveBeenCalledWith(ENDPOINT, "request-1");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("rejects another user's, tampered, and expired legacy receipts", async () => {
    expect((await status(request(STATUS_URL, { receipt: receipt("admin-b") }))).status).toBe(403);
    const valid = receipt();
    expect((await status(request(STATUS_URL, { receipt: `${valid}x` }))).status).toBe(403);
    const expired = receipt(user.id, Date.now() - MODEL_LAB_RECEIPT_TTL_MS - 1);
    expect((await status(request(STATUS_URL, { receipt: expired }))).status).toBe(403);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(0);
  });

  it("rejects a malformed or mixed status query", async () => {
    expect((await status(request(STATUS_URL, {}))).status).toBe(400);
    expect((await status(request(STATUS_URL, { runId: "not-a-uuid" }))).status).toBe(400);
    expect((await status(request(STATUS_URL, { runId: crypto.randomUUID(), receipt: receipt() }))).status).toBe(400);
    expect((await status(request(STATUS_URL, { runId: crypto.randomUUID(), retryStorage: "yes" }))).status).toBe(400);
    expect((await status(request(STATUS_URL, { runId: crypto.randomUUID() }))).status).toBe(404);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("keeps tracking on transient status errors without automatic resubmission", async () => {
    const runId = await queuedRun();
    mocks.status.mockRejectedValueOnce(new Error("temporary"));
    const response = await status(request(STATUS_URL, { runId }));
    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ retryable: true, run: { id: runId, status: "queued" } });
    expect(fake.rows[0].status).toBe("queued");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("requires admin and same-origin checks for status too", async () => {
    const runId = await queuedRun();
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect((await status(request(STATUS_URL, { runId }))).status).toBe(403);
    mocks.isAdmin.mockReturnValueOnce(false);
    expect((await status(request(STATUS_URL, { runId }))).status).toBe(403);
    expect((await status(request(STATUS_URL, { runId }, false))).status).toBe(403);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, oversized, extra-field and rejected-input submissions", async () => {
    const body = submission();
    expect((await submit(request(SUBMIT_URL, body, false))).status).toBe(403);
    expect((await submit(new NextRequest(SUBMIT_URL, { method: "POST", headers: { origin: "https://evil.example" }, body: JSON.stringify(body) }))).status).toBe(403);
    expect((await submit(request(SUBMIT_URL, { ...body, values: { prompt: "x".repeat(33000) } }))).status).toBe(413);
    expect((await submit(request(SUBMIT_URL, { ...body, endpoint: "arbitrary/provider" }))).status).toBe(400);
    mocks.build.mockImplementationOnce(() => { throw new Error("invalid"); });
    expect((await submit(request(SUBMIT_URL, body))).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(0);
  });

  it("enforces rate limits before either paid or status provider requests", async () => {
    const runId = await queuedRun();
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect((await submit(request(SUBMIT_URL, submission()))).status).toBe(429);
    expect((await status(request(STATUS_URL, { runId }))).status).toBe(429);
    // A legacy import is a database write, so it is limited too.
    expect((await status(request(STATUS_URL, { receipt: receipt() }))).status).toBe(429);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(1);
  });

  it("never invents a receipt for an unacknowledged submission", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("secret provider details"));
    const data = await json(await submit(request(SUBMIT_URL, submission())));
    expect(data.submissionUncertain).toBe(true); expect(data).not.toHaveProperty("receipt");
    expect(data.run).toMatchObject({ status: "unknown", requestId: null });
    expect(JSON.stringify(data)).not.toContain("secret provider details");
    expect(fake.rows[0]).toMatchObject({ status: "unknown", error_code: "submission_uncertain", receipt: null });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("unknown states and temporarily unavailable results pause rather than resubmit", async () => {
    const runId = await queuedRun();
    mocks.status.mockResolvedValueOnce({ status: "SOMETHING_NEW" });
    expect(await json(await status(request(STATUS_URL, { runId })))).toMatchObject({ retryable: true, run: { status: "queued" } });
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" }); mocks.result.mockRejectedValueOnce(new Error("unavailable"));
    expect(await json(await status(request(STATUS_URL, { runId })))).toMatchObject({ retryable: true, run: { status: "queued" } });
    expect(fake.rows[0].status).toBe("queued");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("closes structured validation failures from a completed result without another submit", async () => {
    const runId = await queuedRun();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockRejectedValueOnce(Object.assign(new Error("private provider details"), {
      status: 422,
      body: { detail: [{ type: "bool_parsing", loc: ["body", "texture"], msg: "Input should be a valid boolean", input: "standard" }] },
    }));
    const response = await status(request(STATUS_URL, { runId }));
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.run).toMatchObject({ status: "failed", errorCode: "provider_failed", outputs: [] });
    expect(body).not.toHaveProperty("retryable");
    expect(JSON.stringify(body)).not.toContain("private provider details");
    expect(JSON.stringify(body)).not.toContain("bool_parsing");
    expect(fake.rows[0].completed_at).toBeTruthy();
    await status(request(STATUS_URL, { runId }));
    expect(mocks.result).toHaveBeenCalledTimes(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 503, body: { detail: [{ loc: ["body"], msg: "temporarily unavailable" }] } },
    { status: 422 },
    { status: 422, body: { detail: [] } },
  ])("keeps result read failures retryable without terminal validation evidence: %j", async (failure) => {
    const runId = await queuedRun();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockRejectedValueOnce(Object.assign(new Error("read failed"), failure));
    const response = await status(request(STATUS_URL, { runId }));
    expect(response.status).toBe(502);
    expect(await json(response)).toMatchObject({ retryable: true, run: { status: "queued" } });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("preserves terminal failure without pretending to have an output", async () => {
    const runId = await queuedRun();
    mocks.status.mockResolvedValueOnce({ status: "FAILED" });
    expect((await json(await status(request(STATUS_URL, { runId })))).run).toMatchObject({ status: "failed", outputs: [], error: "Sağlayıcı işi tamamlayamadı." });
    expect(mocks.result).not.toHaveBeenCalled();
  });

  it.each([
    { error: "Voice input was rejected", error_type: "UserError" },
    { error: "Model rejected the input" },
    { error_type: "UserError" },
  ])("treats Fal COMPLETED plus error metadata as terminal without fetching a result: %j", async (failure) => {
    const runId = await queuedRun();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED", ...failure });
    const response = await status(request(STATUS_URL, { runId }));
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body.run).toMatchObject({ status: "failed", error: "Sağlayıcı işi tamamlayamadı.", outputs: [] });
    if (failure.error) expect(JSON.stringify(body)).not.toContain(failure.error);
    expect(mocks.result).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("hands only safe completed outputs to the panel, as temporary links when they cannot be stored", async () => {
    const runId = await queuedRun();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    mocks.result.mockResolvedValueOnce({ image: { url: "https://cdn.example/image.png" }, result_url: "javascript:alert(1)" });
    const { run } = await json(await status(request(STATUS_URL, { runId })));
    expect(run).toMatchObject({ status: "completed", storage: "failed" });
    expect(run.outputs).toEqual([{ kind: "image", stored: false, url: "https://cdn.example/image.png", downloadUrl: "https://cdn.example/image.png", bytes: null, mime: null }]);
    expect(JSON.stringify(run)).not.toContain("javascript:");
  });
});

describe("Model Lab output extraction", () => {
  it("filters malicious completed output URLs", () => {
    expect(extractLabOutputs({ image: { url: "https://cdn.example/image.png" }, model_mesh: { url: "http://bad.example/a.glb" }, images: [{ url: "https://127.0.0.1/private.png" }, { url: "https://cdn.example/second.png" }], result_url: "javascript:alert(1)" }))
      .toEqual([{ url: "https://cdn.example/image.png", kind: "image" }, { url: "https://cdn.example/second.png", kind: "image" }]);
  });

  it("supports the existing GLB, mesh and generic output contracts without traversing arbitrary links", () => {
    expect(extractLabOutputs({ glb: { url: "https://cdn.example/a.glb" }, mesh: { url: "https://cdn.example/a.obj" }, output: { url: "https://cdn.example/result.zip" }, unrelated: { url: "https://cdn.example/private" } })).toEqual([
      { url: "https://cdn.example/a.glb", kind: "glb" }, { url: "https://cdn.example/a.obj", kind: "file" }, { url: "https://cdn.example/result.zip", kind: "file" },
    ]);
  });

  it("extracts a safe F5-TTS audio_url string", () => {
    expect(extractLabOutputs({ audio_url: "https://cdn.example/f5-output.wav" })).toEqual([{ url: "https://cdn.example/f5-output.wav", kind: "audio" }]);
  });

  it("extracts a safe F5-TTS audio_url object", () => {
    expect(extractLabOutputs({ audio_url: { url: "https://cdn.example/f5-output.wav" } })).toEqual([{ url: "https://cdn.example/f5-output.wav", kind: "audio" }]);
  });

  it("rejects unsafe F5-TTS audio_url and deduplicates duplicate audio fields", () => {
    expect(extractLabOutputs({
      audio_url: { url: "https://127.0.0.1/private.wav" },
      audio: { url: "https://cdn.example/f5-output.wav" },
      result_url: "https://cdn.example/f5-output.wav",
    })).toEqual([{ url: "https://cdn.example/f5-output.wav", kind: "audio" }]);
  });

  it("ignores payloads that are not plain objects", () => {
    expect(extractLabOutputs(null)).toEqual([]);
    expect(extractLabOutputs([{ url: "https://cdn.example/a.png" }])).toEqual([]);
    expect(extractLabOutputs("https://cdn.example/a.png")).toEqual([]);
  });

  it.each(["https://169.254.169.254/a", "https://[::ffff:127.0.0.1]/a", "https://host.local./a", "https://host.internal/a", "https://localhost./a", "https://user:pass@cdn.example/a"])("rejects unsafe result address %s", (url) => {
    expect(extractLabOutputs({ result_url: url })).toEqual([]);
  });
});
