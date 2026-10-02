import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { MODELS } from "@/lib/fal/models";
import { CreditError } from "@/lib/credits/engine";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), submitJob: vi.fn(), rateLimit: vi.fn(), createSignedUrl: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/jobs/submit", () => ({ submitJob: mocks.submitJob }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, RATE_LIMITS: { jobSubmit: {} } }));
import { POST } from "../route";
import { ImagePreflightError } from "@/lib/media/image-preflight";

const projectId = "11111111-1111-4111-8111-111111111111";
const sourceJob = {
  id: "job-1", user_id: "user-1", project_id: projectId as string | null, tool: "logo", model_id: MODELS["recraft-v4-svg"].id,
  original_request: { prompt: "flower", modelKey: "recraft-v4-svg", extraParams: { outputFormat: "svg", style: "logo" } } as Record<string, unknown>,
  input_params: {},
};
const EXPIRED_UPLOAD = "https://proj.supabase.co/storage/v1/object/sign/uploads/user-1/1700000000-shoe.png?token=OLD-TOKEN";
const imageJob = {
  ...sourceJob,
  tool: "3d-model",
  model_id: MODELS["meshy-v71"].id,
  original_request: { tool: "3d-model", modelKey: "meshy-v71", imageUrl: EXPIRED_UPLOAD, skipBgRemove: true },
};

function installClient(options: {
  user?: { id: string; email: string } | null;
  job?: typeof sourceJob | null;
  jobError?: { message: string } | null;
  project?: { id: string } | null;
  projectError?: { message: string } | null;
} = {}) {
  const chain = (result: { data: unknown; error: unknown }) => {
    const query = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.single.mockResolvedValue(result);
    query.maybeSingle.mockResolvedValue(result);
    return query;
  };
  const jobs = chain({ data: options.job === undefined ? sourceJob : options.job, error: options.jobError ?? null });
  const projects = chain({ data: options.project === undefined ? { id: projectId } : options.project, error: options.projectError ?? null });
  const from = vi.fn((table) => {
    if (table === "jobs") return jobs;
    if (table === "projects") return projects;
    throw new Error(`unexpected ${table}`);
  });
  const storageFrom = vi.fn(() => ({ createSignedUrl: mocks.createSignedUrl }));
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: options.user === undefined ? { id: "user-1", email: "user@example.com" } : options.user } }) },
    from,
    storage: { from: storageFrom },
  });
  return { from, jobs, projects, storageFrom };
}
const regenerate = () => POST(new NextRequest("https://renderhane.com/api/jobs/job-1/regenerate", { method: "POST" }), { params: Promise.resolve({ id: "job-1" }) });

describe("regenerate route authorization and exact replay", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installClient();
    mocks.rateLimit.mockResolvedValue({ success: true });
    mocks.submitJob.mockResolvedValue({ jobId: "new-job", requestId: "new-fal", creditCost: 20, submissionState: "accepted" });
  });

  it("pins the original model/extras and validates the original project's owner", async () => {
    const client = installClient();
    expect((await regenerate()).status).toBe(200);
    expect(mocks.submitJob).toHaveBeenCalledWith({
      userId: "user-1", userEmail: "user@example.com", projectId, tool: "logo",
      modelKey: "recraft-v4-svg", prompt: "flower", extraParams: { outputFormat: "svg", style: "logo" },
    });
    expect(client.projects.eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("rejects unauthenticated access before any database/provider work", async () => {
    const client = installClient({ user: null });
    expect((await regenerate()).status).toBe(401);
    expect(client.from).not.toHaveBeenCalled();
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("enforces the submission rate limit", async () => {
    const client = installClient();
    mocks.rateLimit.mockResolvedValue({ success: false });
    expect((await regenerate()).status).toBe(429);
    expect(client.from).not.toHaveBeenCalled();
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("rejects another owner's job", async () => {
    installClient({ job: { ...sourceJob, user_id: "another-user" } });
    expect((await regenerate()).status).toBe(403);
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("returns 404 for an inaccessible or absent job", async () => {
    installClient({ job: null });
    expect((await regenerate()).status).toBe(404);
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("blocks a retired model instead of charging today's default", async () => {
    installClient({ job: { ...sourceJob, model_id: "retired-endpoint" } });
    expect((await regenerate()).status).toBe(409);
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("blocks a deleted or no-longer-owned project before a new charge", async () => {
    installClient({ project: null });
    expect((await regenerate()).status).toBe(409);
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("fails closed when project verification is unavailable", async () => {
    installClient({ projectError: { message: "database offline" } });
    expect((await regenerate()).status).toBe(503);
    expect(mocks.submitJob).not.toHaveBeenCalled();
  });

  it("does not require a project for a legacy projectless job", async () => {
    const client = installClient({ job: { ...sourceJob, project_id: null } });
    expect((await regenerate()).status).toBe(200);
    expect(client.from).not.toHaveBeenCalledWith("projects");
  });

  it("returns recoverable 202 rather than masking an indeterminate provider acknowledgement", async () => {
    mocks.submitJob.mockResolvedValue({ jobId: "new-job", requestId: null, creditCost: 20, submissionState: "indeterminate", warning: "provider_submission_outcome_indeterminate" });
    const response = await regenerate();
    expect(response.status).toBe(202);
    expect(response.headers.get("Retry-After")).toBe("30");
    await expect(response.json()).resolves.toMatchObject({ jobId: "new-job", warning: "provider_submission_outcome_indeterminate" });
  });

  it("preserves the insufficient-credit status", async () => {
    mocks.submitJob.mockRejectedValue(new CreditError("Insufficient", "INSUFFICIENT"));
    expect((await regenerate()).status).toBe(402);
  });

  it("re-signs the user's own expired upload so the original image is replayed", async () => {
    const client = installClient({ job: imageJob });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://proj.supabase.co/storage/v1/object/sign/uploads/user-1/1700000000-shoe.png?token=FRESH" } });

    expect((await regenerate()).status).toBe(200);

    expect(client.storageFrom).toHaveBeenCalledWith("uploads");
    expect(mocks.createSignedUrl).toHaveBeenCalledWith("user-1/1700000000-shoe.png", 3600);
    expect(mocks.submitJob).toHaveBeenCalledWith(expect.objectContaining({
      modelKey: "meshy-v71",
      imageUrl: "https://proj.supabase.co/storage/v1/object/sign/uploads/user-1/1700000000-shoe.png?token=FRESH",
    }));
  });

  it("returns 422 with the image issues when the replayed image is rejected", async () => {
    installClient({ job: imageJob });
    mocks.createSignedUrl.mockResolvedValue({ data: null });
    mocks.submitJob.mockRejectedValue(new ImagePreflightError([{ code: "unreachable", index: 0, message: "Görsele ulaşılamadı." }]));

    const response = await regenerate();

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({ error: "image_input_invalid", issues: [{ code: "unreachable" }] });
  });

  it("does not expose raw provider or database text in a 500", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.submitJob.mockRejectedValue(new Error('fal 422 {"detail":"image_url invalid","url":"https://x?token=SECRET"}'));

    const response = await regenerate();
    const body = await response.json();
    error.mockRestore();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toMatch(/SECRET|detail|fal 422/);
    expect(body.error).toBe("Yeniden üretim başlatılamadı. Lütfen tekrar deneyin.");
  });
});
