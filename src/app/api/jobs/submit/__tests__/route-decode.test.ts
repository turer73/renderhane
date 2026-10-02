import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The real preflight runs here (download is faked): an image whose header is
// valid but whose pixels do not decode must stop before any project, credit
// reservation or provider call.
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rateLimit: vi.fn(),
  submitJob: vi.fn(),
  autoCreateProject: vi.fn(),
  openPublicDownload: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {} } }));
vi.mock("@/lib/jobs/submit", () => ({ submitJob: mocks.submitJob }));
vi.mock("@/lib/jobs/api-helpers", () => ({ autoCreateProject: mocks.autoCreateProject }));
vi.mock("@/lib/security/safe-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/security/safe-download")>()),
  openPublicDownload: mocks.openPublicDownload,
}));

import { POST } from "../route";
import { png } from "@/lib/media/__tests__/image-fixtures";
import { realImage, truncated } from "@/lib/media/__tests__/real-images";

const UPLOAD = "https://proj.supabase.co/storage/v1/object/sign/uploads/user-1/shoe.png?token=TOKEN";

function serve(bytes: Uint8Array) {
  const response = Object.assign(Readable.from([Buffer.from(bytes)]), { statusCode: 200, headers: {}, complete: true });
  mocks.openPublicDownload.mockResolvedValueOnce({ response, finalUrl: new URL(UPLOAD), contentLength: bytes.byteLength, close: vi.fn() });
}

function submit() {
  return POST(new NextRequest("https://renderhane.com/api/jobs/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tool: "3d-model", modelKey: "meshy-v71", imageUrls: [UPLOAD] }),
  }));
}

describe("POST /api/jobs/submit with undecodable pixels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com" } } }) },
    });
    mocks.rateLimit.mockResolvedValue({ success: true, resetAt: Date.now() + 60_000 });
    mocks.autoCreateProject.mockResolvedValue("project-1");
    mocks.submitJob.mockResolvedValue({ jobId: "job-1", requestId: "fal-1", creditCost: 18, estimatedTime: "~2min", submissionState: "accepted" });
  });

  it.each([
    ["a header-only PNG", async () => png({ width: 1024, height: 1024 })],
    ["a PNG cut in half", async () => truncated(await realImage("png", 800, 600))],
  ])("rejects %s with 422 and spends nothing", async (_label, make) => {
    serve(await make());

    const response = await submit();
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ code: "image_input_invalid", issues: [{ code: "corrupt", index: 0 }] });
    expect(JSON.stringify(body)).not.toContain("TOKEN");
    expect(mocks.autoCreateProject).not.toHaveBeenCalled();
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("lets the same request through once the image really decodes", async () => {
    serve(await realImage("png", 800, 600));

    const response = await submit();

    expect(response.status).toBe(200);
    expect(mocks.submitJob).toHaveBeenCalledTimes(1);
  });
});
