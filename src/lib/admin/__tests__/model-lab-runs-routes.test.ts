import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeLabAdmin } from "./fake-lab-admin";

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
import { DELETE as deleteRun, GET as getRun } from "@/app/api/admin/models/runs/[id]/route";
import { POST as resolveRun } from "@/app/api/admin/models/runs/[id]/resolve/route";
import { POST as preflight } from "@/app/api/admin/models/preflight/route";
import { DELETE as deleteInput } from "@/app/api/admin/models/inputs/route";
import { ImagePreflightError } from "@/lib/media/image-preflight";
import { issueModelLabReceipt } from "../model-lab-receipt";

const SECRET = "lab-test-secret";
const ORIGIN = "https://renderhane.test";
const adminA = { id: "admin-a", email: "a@example.test" };
const adminB = { id: "admin-b", email: "b@example.test" };
const UPLOAD = "https://proj.supabase.co/storage/v1/object/sign/uploads/admin-a/model-lab/inputs/1-shoe.png?token=SECRET-UPLOAD-TOKEN";
const VALUES = { image_url: UPLOAD, prompt: "make the shoe red" };

let fake: ReturnType<typeof createFakeLabAdmin>;

function as(user: { id: string; email: string }) {
  mocks.getUser.mockResolvedValue({ data: { user } });
}
function post(path: string, body: unknown) {
  return new NextRequest(`${ORIGIN}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });
}
function get(path: string) {
  return new NextRequest(`${ORIGIN}${path}`);
}
const DAY_MS = 24 * 60 * 60 * 1000;
const INPUT_PATH = "admin-a/model-lab/inputs/1-shoe.png";
function del(path: string) {
  return new NextRequest(`${ORIGIN}${path}`, { method: "DELETE", headers: { origin: ORIGIN } });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function start(clientRequestId: string = crypto.randomUUID(), values: Record<string, string> = VALUES) {
  const response = await submit(post("/api/admin/models/test", { modelKey: "flux-kontext", values, confirmProviderSpend: true, clientRequestId }));
  return { response, body: await response.json() };
}
async function poll(runId: string, extra: Record<string, unknown> = {}) {
  const response = await statusRoute(post("/api/admin/models/test/status", { runId, ...extra }));
  return { response, body: await response.json() };
}
function serveDownload(contentType = "image/png", bytes = 1234) {
  mocks.openPublicDownload.mockImplementation(async () => ({
    response: Object.assign(Readable.from([Buffer.alloc(bytes, 7)]), { statusCode: 200, headers: { "content-type": contentType }, complete: true }),
    finalUrl: new URL("https://v3.fal.media/files/out.png"),
    contentLength: bytes,
    close: vi.fn(),
  }));
}

describe("Model Lab server history", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FAL_WEBHOOK_SECRET", SECRET);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    fake = createFakeLabAdmin();
    mocks.adminClient = fake.client;
    as(adminA);
    mocks.isAdmin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.preflightImageInputs.mockResolvedValue([]);
    mocks.submit.mockResolvedValue({ requestId: "fal-request-1" });
    mocks.status.mockResolvedValue({ status: "IN_QUEUE", request_id: "fal-request-1" });
    mocks.result.mockResolvedValue({ images: [{ url: "https://v3.fal.media/files/out.png" }] });
    serveDownload();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("records the run before the paid submit and returns it as queued", async () => {
    mocks.submit.mockImplementation(async () => {
      expect(fake.rows).toHaveLength(1);
      expect(fake.rows[0].status).toBe("submitting");
      return { requestId: "fal-request-1" };
    });

    const { response, body } = await start();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ requestId: "fal-request-1", status: "IN_QUEUE", run: { status: "queued", modelKey: "flux-kontext", requestId: "fal-request-1" } });
    expect(typeof body.receipt).toBe("string");
  });

  it("stores the admin's own upload by storage path, never by its signed token", async () => {
    await start();
    expect(fake.rows[0].inputs).toEqual([
      { key: "image_url", kind: "upload", path: "admin-a/model-lab/inputs/1-shoe.png" },
      { key: "prompt", kind: "text", value: "make the shoe red" },
    ]);
    expect(JSON.stringify(fake.rows[0])).not.toContain("SECRET-UPLOAD-TOKEN");
  });

  it("never submits twice for the same browser attempt", async () => {
    const id = crypto.randomUUID();
    const first = await start(id);
    const second = await start(id);

    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(second.response.status).toBe(200);
    expect(second.body).toMatchObject({ duplicate: true, run: { id: first.body.run.id } });
    expect(fake.rows).toHaveLength(1);
  });

  it("rejects an unusable image with 422 per field before recording or spending", async () => {
    mocks.preflightImageInputs.mockRejectedValueOnce(
      new ImagePreflightError([{ code: "unsupported_format", index: 0, message: "GIF biçimi bu modelde desteklenmiyor." }])
    );

    const { response, body } = await start();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "image_input_invalid", issues: [{ code: "unsupported_format", field: "image_url" }] });
    expect(fake.rows).toHaveLength(0);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("requires a client request id and fails closed when history cannot be written", async () => {
    const missing = await submit(post("/api/admin/models/test", { modelKey: "flux-kontext", values: VALUES, confirmProviderSpend: true }));
    expect(missing.status).toBe(400);
    fake.failures.insert = true;
    const { response } = await start();
    expect(response.status).toBe(503);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("marks an unacknowledged submit unknown and never retries it", async () => {
    mocks.submit.mockRejectedValueOnce(new Error("socket hang up"));

    const { response, body } = await start();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ submissionUncertain: true, run: { status: "unknown" } });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    // Polling an unknown run reads nothing from the provider and submits nothing.
    await poll(body.run.id);
    expect(mocks.status).not.toHaveBeenCalled();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("resumes after a refresh with status reads only, then stores the outputs privately", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValueOnce({ status: "IN_PROGRESS" });
    expect((await poll(body.run.id)).body.run.status).toBe("running");

    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    const done = await poll(body.run.id);

    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(done.body.run).toMatchObject({ status: "completed", storage: "stored" });
    expect(fake.calls.uploads).toEqual([`admin-a/model-lab/${body.run.id}/0.png`]);
    expect(done.body.run.outputs).toEqual([
      expect.objectContaining({ kind: "image", stored: true, url: expect.stringContaining(`/uploads/admin-a/model-lab/${body.run.id}/0.png?token=`) }),
    ]);
    expect(done.body.run.outputs[0].downloadUrl).toContain("download=");
  });

  it("shows provider links as temporary when storage fails, and stores them on retry", async () => {
    const { body } = await start();
    fake.failures.upload = true;
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    const failed = await poll(body.run.id);
    expect(failed.body.run).toMatchObject({ status: "completed", storage: "failed" });
    expect(failed.body.run.outputs[0]).toMatchObject({ stored: false, url: "https://v3.fal.media/files/out.png" });

    fake.failures.upload = false;
    const retried = await poll(body.run.id, { retryStorage: true });
    expect(retried.body.run).toMatchObject({ storage: "stored", outputs: [expect.objectContaining({ stored: true })] });
    expect(mocks.result).toHaveBeenCalledTimes(1);
  });

  it("lets only one of two simultaneous completions copy the files", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValue({ status: "COMPLETED" });

    await Promise.all([poll(body.run.id), poll(body.run.id)]);

    expect(fake.calls.uploads).toHaveLength(1);
    expect(fake.rows[0]).toMatchObject({ status: "completed", storage_state: "stored" });
  });

  it("isolates history: another admin cannot read, poll, delete or resolve a run", async () => {
    const { body } = await start();
    as(adminB);

    expect((await poll(body.run.id)).response.status).toBe(404);
    expect((await getRun(get(`/api/admin/models/runs/${body.run.id}`), params(body.run.id))).status).toBe(404);
    expect((await deleteRun(del(`/api/admin/models/runs/${body.run.id}`), params(body.run.id))).status).toBe(404);
    expect((await resolveRun(post(`/api/admin/models/runs/${body.run.id}/resolve`, {}), params(body.run.id))).status).toBe(404);
    const list = await (await listRuns(get("/api/admin/models/runs"))).json();
    expect(list.runs).toEqual([]);
  });

  it("keeps earlier runs when a new one starts, newest first", async () => {
    const first = await start();
    const second = await start();
    const list = await (await listRuns(get("/api/admin/models/runs"))).json();
    expect(list.runs.map((run: { id: string }) => run.id)).toEqual([second.body.run.id, first.body.run.id]);
    expect(list.retentionDays).toBe(30);
  });

  it("refreshes expired links: every read signs again with a future expiry", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    const done = await poll(body.run.id);
    const firstUrl = done.body.run.outputs[0].url;

    const again = await (await getRun(get(`/api/admin/models/runs/${body.run.id}`), params(body.run.id))).json();

    expect(again.run.outputs[0].url).not.toBe(firstUrl);
    expect(again.run.linksExpireAt).toBeGreaterThan(Date.now());
  });

  it("deletes only finished runs, with their outputs, but keeps an upload another run still uses", async () => {
    const running = await start();
    expect((await deleteRun(del(`/api/admin/models/runs/${running.body.run.id}`), params(running.body.run.id))).status).toBe(409);

    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(running.body.run.id);
    await start(); // a second run reuses the same uploaded image

    const response = await deleteRun(del(`/api/admin/models/runs/${running.body.run.id}`), params(running.body.run.id));

    expect(response.status).toBe(200);
    expect(fake.calls.removes.flat()).toEqual([`admin-a/model-lab/${running.body.run.id}/0.png`]);
    // The row stays only as a tombstone: no content, not listed, not readable.
    expect(fake.rows.find((row) => row.id === running.body.run.id)).toMatchObject({
      deleted_at: expect.any(String), inputs: [], outputs: [], receipt: null, storage_state: "none", storage_lease_until: null,
    });
    expect((await getRun(get(`/api/admin/models/runs/${running.body.run.id}`), params(running.body.run.id))).status).toBe(404);
    expect((await (await listRuns(get("/api/admin/models/runs"))).json()).runs.map((run: { id: string }) => run.id)).not.toContain(running.body.run.id);
  });

  it("purges expired runs and their files when history is read", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(body.run.id);
    fake.rows[0].expires_at = new Date(Date.now() - 1000).toISOString();

    const list = await (await listRuns(get("/api/admin/models/runs"))).json();

    expect(list.runs).toEqual([]);
    expect(fake.rows).toEqual([expect.objectContaining({ id: body.run.id, deleted_at: expect.any(String), inputs: [], outputs: [], receipt: null })]);
    expect(fake.calls.removes.flat()).toEqual(expect.arrayContaining([`admin-a/model-lab/${body.run.id}/0.png`, "admin-a/model-lab/inputs/1-shoe.png"]));
  });

  it("closes an unknown run only after the admin checked provider history", async () => {
    const queued = await start();
    expect((await resolveRun(post(`/api/admin/models/runs/${queued.body.run.id}/resolve`, {}), params(queued.body.run.id))).status).toBe(409);

    mocks.submit.mockRejectedValueOnce(new Error("lost"));
    const unknown = await start();
    const resolved = await (await resolveRun(post(`/api/admin/models/runs/${unknown.body.run.id}/resolve`, {}), params(unknown.body.run.id))).json();

    expect(resolved.run).toMatchObject({ status: "failed" });
    expect(mocks.submit).toHaveBeenCalledTimes(2);
  });

  it("imports a legacy browser-local run once from its receipt", async () => {
    const receipt = issueModelLabReceipt({ userId: "admin-a", modelKey: "flux-kontext", endpoint: "fal-ai/flux-pro/kontext", requestId: "legacy-1" }, SECRET);

    const first = await statusRoute(post("/api/admin/models/test/status", { receipt }));
    const second = await statusRoute(post("/api/admin/models/test/status", { receipt }));

    expect(first.status).toBe(200);
    expect((await first.json()).run).toMatchObject({ status: "queued", requestId: "legacy-1" });
    expect((await second.json()).run.id).toBe(fake.rows[0].id);
    expect(fake.rows).toHaveLength(1);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("turns a submit that never got an acknowledgement into unknown without asking the provider", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    let release!: () => void;
    mocks.submit.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ requestId: "late" }); }));
    const pending = start();
    await vi.waitFor(() => expect(fake.rows).toHaveLength(1));

    vi.setSystemTime(new Date("2026-10-02T12:03:00Z"));
    const polled = await poll(fake.rows[0].id as string);
    expect(polled.body.run.status).toBe("unknown");
    expect(mocks.status).not.toHaveBeenCalled();

    // A late acknowledgement restores tracking; it never causes a second submit.
    release();
    await pending;
    expect(fake.rows[0]).toMatchObject({ status: "queued", request_id: "late" });
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });

  it("does not reopen a run the admin already closed when its acknowledgement arrives", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    let release!: () => void;
    mocks.submit.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ requestId: "late" }); }));
    const pending = start();
    await vi.waitFor(() => expect(fake.rows).toHaveLength(1));
    vi.setSystemTime(new Date("2026-10-02T12:03:00Z"));
    await poll(fake.rows[0].id as string);
    await resolveRun(post(`/api/admin/models/runs/${fake.rows[0].id}/resolve`, {}), params(fake.rows[0].id as string));

    release();
    await pending;
    expect(fake.rows[0].status).toBe("failed");
  });

  it("stops tracking a run whose stored receipt expired", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T12:00:00Z"));
    const { body } = await start();
    vi.setSystemTime(new Date("2026-10-03T12:00:01Z"));

    const polled = await poll(body.run.id);

    expect(polled.body.run.status).toBe("unknown");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("validates without spending in the preflight step", async () => {
    const ok = await preflight(post("/api/admin/models/preflight", { modelKey: "flux-kontext", values: VALUES }));
    expect(ok.status).toBe(200);
    mocks.preflightImageInputs.mockRejectedValueOnce(new ImagePreflightError([{ code: "too_large", index: 0, message: "Dosya çok büyük." }]));
    const bad = await preflight(post("/api/admin/models/preflight", { modelKey: "flux-kontext", values: VALUES }));
    expect(bad.status).toBe(422);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(fake.rows).toHaveLength(0);
  });

  it("never deletes an upload outside the lab input folder, e.g. one pasted from a main-app job", async () => {
    const mainUpload = "https://proj.supabase.co/storage/v1/object/sign/uploads/admin-a/1700000000-main.png?token=MAIN-TOKEN";
    const { body } = await start(crypto.randomUUID(), { image_url: mainUpload, prompt: "x" });
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(body.run.id);

    expect((await deleteRun(del(`/api/admin/models/runs/${body.run.id}`), params(body.run.id))).status).toBe(200);

    expect(fake.calls.removes.flat()).toEqual([`admin-a/model-lab/${body.run.id}/0.png`]);
  });

  it("keeps inputs that are still in the open form when a run is deleted", async () => {
    const { body } = await start();
    mocks.status.mockResolvedValueOnce({ status: "COMPLETED" });
    await poll(body.run.id);
    const id = body.run.id;

    expect((await deleteRun(del(`/api/admin/models/runs/${id}?keep=${encodeURIComponent("admin-b/model-lab/inputs/x.png")}`), params(id))).status).toBe(400);
    expect((await deleteRun(del(`/api/admin/models/runs/${id}?keep=${encodeURIComponent("admin-a/model-lab/inputs/../x.png")}`), params(id))).status).toBe(400);
    expect(fake.calls.removes).toEqual([]);

    expect((await deleteRun(del(`/api/admin/models/runs/${id}?keep=${encodeURIComponent(INPUT_PATH)}`), params(id))).status).toBe(200);
    expect(fake.calls.removes.flat()).toEqual([`admin-a/model-lab/${id}/0.png`]);
  });

  it("removes an uploaded input the admin dropped before using it, but keeps one a run uses", async () => {
    const remove = (path: string) => deleteInput(del(`/api/admin/models/inputs?path=${encodeURIComponent(path)}`));
    await start(); // INPUT_PATH is now used by a run

    const unused = await remove("admin-a/model-lab/inputs/2-unused.png");
    expect(unused.status).toBe(200);
    expect(await unused.json()).toEqual({ removed: true });
    const used = await remove(INPUT_PATH);
    expect(await used.json()).toEqual({ removed: false, inUse: true });
    expect(fake.calls.removes).toEqual([["admin-a/model-lab/inputs/2-unused.png"]]);

    for (const path of ["admin-b/model-lab/inputs/x.png", "admin-a/1700-main.png", "admin-a/model-lab/inputs/../../x.png", "admin-a/model-lab/inputs/"]) {
      expect((await remove(path)).status).toBe(400);
    }
    expect((await deleteInput(new NextRequest(`${ORIGIN}/api/admin/models/inputs?path=${encodeURIComponent("admin-a/model-lab/inputs/3.png")}`, { method: "DELETE" }))).status).toBe(403);
    fake.failures.count = true;
    expect((await remove("admin-a/model-lab/inputs/4.png")).status).toBe(503);
    expect(fake.calls.removes).toHaveLength(1);
  });

  it("purges uploads from abandoned forms after the retention period, never one a run uses", async () => {
    await start(); // uses INPUT_PATH
    const old = new Date(Date.now() - 31 * DAY_MS).toISOString();
    fake.seedObject(INPUT_PATH, old);
    fake.seedObject("admin-a/model-lab/inputs/abandoned.png", old);
    fake.seedObject("admin-a/model-lab/inputs/fresh.png");
    fake.seedObject("admin-a/model-lab/inputs/nested/old.png", old);

    expect((await listRuns(get("/api/admin/models/runs"))).status).toBe(200);

    expect(fake.calls.removes).toEqual([["admin-a/model-lab/inputs/abandoned.png"]]);
    expect(fake.objects.has(INPUT_PATH)).toBe(true);
    expect(fake.objects.has("admin-a/model-lab/inputs/fresh.png")).toBe(true);
  });
});
