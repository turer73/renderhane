import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  rateLimit: vi.fn(),
  submitJob: vi.fn(),
  autoCreateProject: vi.fn(),
  preflightImageInputs: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {} } }));
vi.mock("@/lib/jobs/submit", () => ({ submitJob: mocks.submitJob }));
vi.mock("@/lib/jobs/api-helpers", () => ({ autoCreateProject: mocks.autoCreateProject }));
vi.mock("@/lib/media/image-preflight", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media/image-preflight")>()),
  preflightImageInputs: mocks.preflightImageInputs,
}));

import { POST } from "../route";
import { ImagePreflightError } from "@/lib/media/image-preflight";

const UPLOAD = "https://proj.supabase.co/storage/v1/object/sign/uploads/user-1/shoe.png?token=TOKEN";

function submit(body: Record<string, unknown>) {
  return POST(new NextRequest("https://renderhane.com/api/jobs/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
}

describe("POST /api/jobs/submit image preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1", email: "user@example.com" } } }) },
    });
    mocks.rateLimit.mockResolvedValue({ success: true, resetAt: Date.now() + 60_000 });
    mocks.autoCreateProject.mockResolvedValue("project-1");
    mocks.preflightImageInputs.mockResolvedValue([]);
    mocks.submitJob.mockResolvedValue({ jobId: "job-1", requestId: "fal-1", creditCost: 80, estimatedTime: "~2min", submissionState: "accepted" });
  });

  it("rejects an unusable image with 422 before creating a project or submitting", async () => {
    mocks.preflightImageInputs.mockRejectedValueOnce(
      new ImagePreflightError([{ code: "unsupported_format", index: 0, message: "WebP biçimi bu modelde desteklenmiyor." }])
    );

    const response = await submit({ tool: "3d-model", modelKey: "meshy-v71", imageUrls: [UPLOAD] });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body).toMatchObject({ error: "image_input_invalid", issues: [{ code: "unsupported_format", index: 0 }] });
    expect(JSON.stringify(body)).not.toContain("TOKEN");
    expect(mocks.autoCreateProject).not.toHaveBeenCalled();
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("checks against the selected model and hands the facts to submitJob without a second read", async () => {
    const response = await submit({ tool: "3d-model", modelKey: "meshy-v71", imageUrls: [UPLOAD] });

    expect(response.status).toBe(200);
    const [{ urls, limits, cache }] = mocks.preflightImageInputs.mock.calls[0];
    expect(urls).toEqual([UPLOAD]);
    expect(limits.modelKeys).toEqual(["meshy-v71"]);
    expect(mocks.submitJob).toHaveBeenCalledWith(expect.objectContaining({ imageFactsCache: cache }));
    expect(mocks.autoCreateProject).toHaveBeenCalledOnce();
  });

  it("maps a rejection raised inside submitJob to the same 422 body", async () => {
    mocks.submitJob.mockRejectedValueOnce(
      new ImagePreflightError([{ code: "too_large", index: 0, message: "Dosya 9 MB; bu model en fazla 8 MB kabul ediyor." }])
    );

    const response = await submit({ tool: "3d-model", modelKey: "hunyuan3d-v31-pro", imageUrls: [UPLOAD] });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ issues: [{ code: "too_large" }] });
  });

  it("does not read the discarded QR style image", async () => {
    await submit({ tool: "qr-code", prompt: "https://renderhane.com", imageUrl: UPLOAD });
    expect(mocks.preflightImageInputs).not.toHaveBeenCalled();
  });
});
