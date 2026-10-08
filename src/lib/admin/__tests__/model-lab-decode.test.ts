import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createFakeLabAdmin } from "./fake-lab-admin";

// Real image preflight (download faked): undecodable pixels stop the probe
// before the run is recorded and before the provider is called.
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), isAdmin: vi.fn(), rateLimit: vi.fn(), submit: vi.fn(),
  openPublicDownload: vi.fn(), adminClient: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => mocks.adminClient }));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {}, general: {} } }));
vi.mock("@/lib/ai", () => ({ getAIProvider: () => ({ submit: mocks.submit }) }));
vi.mock("@/lib/security/safe-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/safe-download")>()),
  openPublicDownload: mocks.openPublicDownload,
}));

import { POST as submit } from "@/app/api/admin/models/test/route";
import { jpeg } from "@/lib/media/__tests__/image-fixtures";
import { heicContainer, realImage, truncated } from "@/lib/media/__tests__/real-images";

const ORIGIN = "https://renderhane.test";
const IMAGE = "https://cdn.example.com/shoe.jpg";
let fake: ReturnType<typeof createFakeLabAdmin>;

function serve(bytes: Uint8Array) {
  const response = Object.assign(Readable.from([Buffer.from(bytes)]), { statusCode: 200, headers: {}, complete: true });
  mocks.openPublicDownload.mockResolvedValueOnce({ response, finalUrl: new URL(IMAGE), contentLength: bytes.byteLength, close: vi.fn() });
}
function start(modelKey = "flux-kontext") {
  return submit(new NextRequest(`${ORIGIN}/api/admin/models/test`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGIN },
    body: JSON.stringify({ modelKey, values: modelKey === "meshy-v71" ? { image_url: IMAGE } : { image_url: IMAGE, prompt: "red" }, confirmProviderSpend: true, clientRequestId: crypto.randomUUID() }),
  }));
}

describe("Model Lab submit with undecodable pixels", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("FAL_WEBHOOK_SECRET", "secret");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    fake = createFakeLabAdmin();
    mocks.adminClient = fake.client;
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-a", email: "a@example.test" } } });
    mocks.isAdmin.mockReturnValue(true);
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.submit.mockResolvedValue({ requestId: "fal-1" });
  });

  it.each([
    ["a JPEG header with an empty scan", async () => jpeg({ width: 1024, height: 1024 })],
    ["a JPEG cut in half", async () => truncated(await realImage("jpeg", 1024, 768))],
  ])("rejects %s per field before recording or paying", async (_label, make) => {
    serve(await make());

    const response = await start();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "image_input_invalid", issues: [{ code: "corrupt", field: "image_url" }] });
    expect(fake.rows).toHaveLength(0);
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("records and submits once the image decodes", async () => {
    serve(await realImage("jpeg", 1024, 768));

    expect((await start()).status).toBe(202);
    expect(fake.rows).toHaveLength(1);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
  });
  it("rejects a fake HEIC before recording a Meshy run or spending", async () => {
    serve(heicContainer(64, 64));
    const response = await start("meshy-v71");
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("JPEG veya PNG");
    expect(fake.rows).toHaveLength(0);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
