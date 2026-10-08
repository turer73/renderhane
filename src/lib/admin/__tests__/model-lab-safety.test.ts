import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { barrier, createFakeLabAdmin } from "./fake-lab-admin";

// Regression tests for review 101709: no second charge after deletion, no
// input deleted under a paid run, and output copying within a time budget.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), rateLimit: vi.fn(),
  submit: vi.fn(), status: vi.fn(), result: vi.fn(),
  preflightImageInputs: vi.fn(), openPublicDownload: vi.fn(),
  adminClient: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {}, general: {} } }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ submit: mocks.submit, status: mocks.status, result: mocks.result }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.adminClient }));
vi.mock("@/lib/media/image-preflight", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/image-preflight")>()),
  preflightImageInputs: mocks.preflightImageInputs,
}));
vi.mock("@/lib/security/safe-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/safe-download")>()),
  openPublicDownload: mocks.openPublicDownload,
}));

import { POST as submit } from "@/app/api/admin/models/test/route";
import { POST as statusRoute } from "@/app/api/admin/models/test/status/route";
import { GET as listRuns } from "@/app/api/admin/models/runs/route";
import { DELETE as deleteRun } from "@/app/api/admin/models/runs/[id]/route";
import { DELETE as deleteInput } from "@/app/api/admin/models/inputs/route";
import { issueModelLabReceipt } from "../model-lab-receipt";

const SECRET = "lab-test-secret";
const ORIGIN = "https://renderhane.test";
const INPUT_PATH = "admin-a/model-lab/inputs/1-shoe.png";
const UPLOAD = `https://proj.supabase.co/storage/v1/object/sign/uploads/${INPUT_PATH}?token=T`;
const EXTERNAL = { image_url: "https://cdn.example.com/shoe.png", prompt: "red" };
const RUNS = "model_lab_runs";
const CLAIMS = "model_lab_input_deletions";

let fake: ReturnType<typeof createFakeLabAdmin>;

function post(path: string, body: unknown) {
  return new NextRequest(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });
}
function del(path: string) {
  return new NextRequest(`${ORIGIN}${path}`, { method: "DELETE", headers: { origin: ORIGIN } });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
async function start(clientRequestId: string = crypto.randomUUID(), values: Record<string, string> = { image_url: UPLOAD, prompt: "red" }) {
  const response = await submit(post("/api/admin/models/test", { modelKey: "flux-kontext", values, confirmProviderSpend: true, clientRequestId }));
  return { response, body: await response.json() };
}
async function poll(runId: string, extra: Record<string, unknown> = {}) {
  const response = await statusRoute(post("/api/admin/models/test/status", { runId, ...extra }));
  return { response, body: await response.json() };
}
function removeInput(path: string) {
  return deleteInput(del(`/api/admin/models/inputs?path=${encodeURIComponent(path)}`));
}
function served(bytes = 1000) {
  return {
    response: Object.assign(Readable.from([Buffer.alloc(bytes, 7)]), { statusCode: 200, headers: { "content-type": "image/png" }, complete: true }),
    finalUrl: new URL("https://v3.fal.media/files/out.png"),
    contentLength: bytes,
    close: vi.fn(),
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("FAL_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  fake = createFakeLabAdmin();
  mocks.adminClient = fake.client;
  fake.seedObject(INPUT_PATH);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-a", email: "a@example.test" } } });
  mocks.isAdmin.mockReturnValue(true);
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.preflightImageInputs.mockResolvedValue([]);
  mocks.submit.mockResolvedValue({ requestId: "fal-request-1" });
  mocks.status.mockResolvedValue({ status: "IN_QUEUE" });
  mocks.result.mockResolvedValue({ images: [{ url: "https://v3.fal.media/files/out.png" }] });
  mocks.openPublicDownload.mockImplementation(async () => served());
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("a deleted run keeps blocking its attempt id", () => {
  it("resending the attempt of a deleted run is refused without paying again", async () => {
    const id = crypto.randomUUID();
    const first = await start(id, EXTERNAL);
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(first.body.run.id);
    expect((await deleteRun(del(`/api/admin/models/runs/${first.body.run.id}`), params(first.body.run.id))).status).toBe(200);

    const again = await start(id, EXTERNAL);

    expect(again.response.status).toBe(409);
    expect(again.body).toMatchObject({ code: "attempt_deleted" });
    expect(again.body).not.toHaveProperty("run");
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(fake.rows).toHaveLength(1);
  });

  it("expiry also leaves a tombstone, so the attempt cannot pay again after 30 days", async () => {
    const id = crypto.randomUUID();
    const first = await start(id, EXTERNAL);
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(first.body.run.id);
    fake.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    await listRuns(new NextRequest(`${ORIGIN}/api/admin/models/runs`));

    expect(fake.rows[0]).toMatchObject({ deleted_at: expect.any(String), inputs: [], outputs: [], receipt: null });
    expect((await start(id, EXTERNAL)).response.status).toBe(409);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("an unfinished run that expired becomes an unknown tombstone, never a pollable one", async () => {
    const queued = await start(crypto.randomUUID(), EXTERNAL);
    fake.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    await listRuns(new NextRequest(`${ORIGIN}/api/admin/models/runs`));

    expect(fake.rows[0]).toMatchObject({ status: "unknown", deleted_at: expect.any(String), receipt: null });
    expect((await poll(queued.body.run.id)).response.status).toBe(404);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("does not import a deleted run again from a browser-local receipt", async () => {
    const receipt = issueModelLabReceipt({ userId: "admin-a", modelKey: "flux-kontext", endpoint: "fal-ai/flux-pro/kontext", requestId: "legacy-1" }, SECRET);
    const imported = await statusRoute(post("/api/admin/models/test/status", { receipt }));
    const runId = (await imported.json()).run.id;
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(runId);
    expect((await deleteRun(del(`/api/admin/models/runs/${runId}`), params(runId))).status).toBe(200);

    const again = await statusRoute(post("/api/admin/models/test/status", { receipt }));

    expect(again.status).toBe(410);
    expect(await again.json()).toMatchObject({ code: "attempt_deleted" });
    expect(fake.rows).toHaveLength(1);
  });
});

describe("deleting an upload while another tab submits it", () => {
  it("a deletion that claims the file first stops the submit before any payment", async () => {
    const paused = barrier();
    let armed = false;
    fake.hooks.gate = async (table, mode) => {
      if (table === CLAIMS && mode === "insert") armed = true;
      else if (armed && table === RUNS && mode === "select") {
        armed = false; // pause the delete after its claim, before its usage check
        paused.reached();
        await paused.opened;
      }
    };
    const deleting = removeInput(INPUT_PATH);
    await paused.arrived;

    const submitted = await start();
    paused.release();
    const deleted = await (await deleting).json();

    expect(submitted.response.status).toBe(409);
    expect(submitted.body).toMatchObject({ code: "input_deleted", run: { status: "failed", errorCode: "input_deleted" } });
    expect(mocks.submit).not.toHaveBeenCalled();
    // The unpaid run still names the file, so the delete keeps it: nothing is lost either way.
    expect(deleted).toEqual({ removed: false, inUse: true });
    expect(fake.objects.has(INPUT_PATH)).toBe(true);
    expect(fake.claims).toEqual([]);
  });

  it("a submit that pins the file first keeps it through the delete, and pays once", async () => {
    const paused = barrier();
    let armed = false;
    fake.hooks.gate = async (table, mode) => {
      if (table === RUNS && mode === "insert") armed = true;
      else if (armed && table === CLAIMS && mode === "select") {
        armed = false; // pause the submit after recording its run, before its claim check
        paused.reached();
        await paused.opened;
      }
    };
    const submitting = start();
    await paused.arrived;

    const deleted = await (await removeInput(INPUT_PATH)).json();
    paused.release();
    const submitted = await submitting;

    expect(deleted).toEqual({ removed: false, inUse: true });
    expect(fake.claims).toEqual([]);
    expect(submitted.response.status).toBe(202);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(fake.objects.has(INPUT_PATH)).toBe(true);
    expect(fake.calls.removes).toEqual([]);
  });

  it("deleting an old run keeps an input that a run being submitted has just pinned", async () => {
    const old = await start();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(old.body.run.id);
    const paused = barrier();
    let armed = false;
    fake.hooks.gate = async (table, mode) => {
      if (table === RUNS && mode === "insert") armed = true;
      else if (armed && table === CLAIMS && mode === "select") {
        armed = false;
        paused.reached();
        await paused.opened;
      }
    };
    const submitting = start();
    await paused.arrived;

    expect((await deleteRun(del(`/api/admin/models/runs/${old.body.run.id}`), params(old.body.run.id))).status).toBe(200);
    paused.release();

    expect((await submitting).response.status).toBe(202);
    expect(fake.objects.has(INPUT_PATH)).toBe(true);
    expect(fake.calls.removes.flat()).not.toContain(INPUT_PATH);
  });

  it("an input already deleted blocks a submit that slipped past the file check", async () => {
    fake.claims.push({ user_id: "admin-a", path: INPUT_PATH, created_at: new Date().toISOString() });

    const submitted = await start();

    expect(submitted.response.status).toBe(409);
    expect(submitted.body).toMatchObject({ code: "input_deleted" });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("stops unpaid when deletion claims cannot be read", async () => {
    fake.failures.claims = true;

    const submitted = await start();

    expect(submitted.response.status).toBe(503);
    expect(submitted.body).toMatchObject({ code: "history_unavailable", run: { status: "failed", errorCode: "input_check_failed" } });
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("reports a failed coordination as an error, not as a file in use", async () => {
    fake.failures.claims = true;
    const response = await removeInput("admin-a/model-lab/inputs/2-unused.png");
    expect(response.status).toBe(503);
    expect(fake.calls.removes).toEqual([]);
  });
});

describe("copying outputs within a time budget", () => {
  const threeImages = { images: [{ url: "https://v3.fal.media/files/a.png" }, { url: "https://v3.fal.media/files/b.png" }, { url: "https://v3.fal.media/files/c.png" }] };

  it("saves progress after each file, stops before the deadline and continues on the next read", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { body } = await start();
    mocks.status.mockResolvedValue({ status: "COMPLETED" });
    mocks.result.mockResolvedValue(threeImages);
    const timeouts: number[] = [];
    let savedBeforeSecond: unknown = null;
    mocks.openPublicDownload.mockImplementation(async (_url: string, options: { timeoutMs: number }) => {
      timeouts.push(options.timeoutMs);
      if (timeouts.length === 2) savedBeforeSecond = (fake.rows[0].outputs as Array<{ path: string | null }>)[0].path;
      vi.setSystemTime(Date.now() + 35_000); // each file takes 35 s
      return served();
    });

    const first = await poll(body.run.id);

    expect(first.body.run.storage).toBe("pending");
    expect(fake.rows[0]).toMatchObject({ storage_state: "pending", storage_lease_until: null });
    expect((fake.rows[0].outputs as Array<{ path: string | null }>).map((output) => Boolean(output.path))).toEqual([true, true, false]);
    // File 1 was saved before file 2 started; file 2 only got what was left of the budget.
    expect(savedBeforeSecond).toEqual(expect.stringContaining("/0.png"));
    expect(timeouts).toEqual([60_000, 30_000]);

    const second = await poll(body.run.id);

    expect(second.body.run.storage).toBe("stored");
    expect(timeouts).toHaveLength(3); // only the file left was downloaded
    expect(fake.rows[0].storage_lease_until).toBeNull();
  });

  it("a request that lost its lease stops at once and writes nothing", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValue({ status: "COMPLETED" });
    mocks.result.mockResolvedValue(threeImages);
    const stolen = new Date(Date.now() + 600_000).toISOString();
    mocks.openPublicDownload.mockImplementation(async () => {
      fake.rows[0].storage_lease_until = stolen; // another request took the copy over
      return served();
    });

    await poll(body.run.id);

    expect(mocks.openPublicDownload).toHaveBeenCalledTimes(1);
    expect(fake.rows[0].storage_lease_until).toBe(stolen);
    expect((fake.rows[0].outputs as Array<{ path: string | null }>).every((output) => output.path === null)).toBe(true);
  });

  it("continues a copy whose holder died, but never one whose lease is still held", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValue({ status: "COMPLETED" });
    mocks.result.mockResolvedValue(threeImages);
    mocks.openPublicDownload.mockImplementation(async () => {
      if (mocks.openPublicDownload.mock.calls.length === 2) throw new Error("request killed"); // stands in for maxDuration
      return served();
    });
    await poll(body.run.id);
    // Simulate the copier dying mid-way: pending, lease still held, one file stored.
    Object.assign(fake.rows[0], {
      storage_state: "pending",
      storage_lease_until: new Date(Date.now() + 60_000).toISOString(),
      outputs: (fake.rows[0].outputs as Array<Record<string, unknown>>).map((output, index) =>
        index === 0 ? output : { ...output, path: null, error: null, bytes: null, mime: null }),
    });
    mocks.openPublicDownload.mockReset();
    mocks.openPublicDownload.mockImplementation(async () => served());

    await poll(body.run.id);
    expect(mocks.openPublicDownload).not.toHaveBeenCalled();

    fake.rows[0].storage_lease_until = new Date(Date.now() - 1).toISOString();
    const continued = await poll(body.run.id);

    expect(mocks.openPublicDownload).toHaveBeenCalledTimes(2);
    expect(continued.body.run.storage).toBe("stored");
  });

  it("refuses to delete while a copy holds the lease, and holds it itself while deleting", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(body.run.id);
    fake.rows[0].storage_state = "pending";
    fake.rows[0].storage_lease_until = new Date(Date.now() + 60_000).toISOString();
    expect((await deleteRun(del(`/api/admin/models/runs/${body.run.id}`), params(body.run.id))).status).toBe(409);

    // Released for continuation with a file still to copy: the delete may go ahead,
    // and no copy may start meanwhile (a continuation would download that file).
    fake.rows[0].storage_lease_until = null;
    fake.rows[0].outputs = (fake.rows[0].outputs as Array<Record<string, unknown>>).map((output) => ({ ...output, path: null, bytes: null, mime: null, error: null }));
    const paused = barrier();
    fake.hooks.gate = async (table, mode) => {
      if (table === CLAIMS && mode === "insert") {
        fake.hooks.gate = null;
        paused.reached();
        await paused.opened;
      }
    };
    const deleting = deleteRun(del(`/api/admin/models/runs/${body.run.id}`), params(body.run.id));
    await paused.arrived;
    mocks.openPublicDownload.mockClear();
    await poll(body.run.id);
    expect(mocks.openPublicDownload).not.toHaveBeenCalled();
    paused.release();

    expect((await deleting).status).toBe(200);
    expect(fake.rows[0]).toMatchObject({ deleted_at: expect.any(String), storage_lease_until: null });
  });
});
