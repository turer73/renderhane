import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
import { GET, POST } from "@/app/api/relief/workshop/[[...path]]/route";
import { isWorkshopReadOnly } from "../workshop-lifecycle";
import { proxyWorkshop } from "../workshop-server";

const id = "00000000-0000-4000-8000-000000000001";
const origin = "https://www.renderhane.com";
const base = `${origin}/api/relief/workshop`;
const queued = {
  id, spec_hash: "a".repeat(64), state: "queued", attempts: 0, created_at: 1, error: null,
  spec: { recipe: { width_mm: 70, relief_depth_mm: 1, base_thickness_mm: 3 }, sample: null }, result: null,
};
const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
const post = (path: string[] = [], body = "{}") => new Request(`${base}/${path.join("/")}`, {
  method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body,
});

// Do not mock the lifecycle gate: these exercise the shipped archive policy.
describe("legacy workshop archive (real default gate)", () => {
  beforeEach(() => {
    vi.stubEnv("RELIEF_WORKSHOP_ENABLED", "true");
    vi.stubEnv("RELIEF_WORKSHOP_URL", "https://private-worker.example");
    vi.stubEnv("RELIEF_WORKSHOP_TOKEN", "x".repeat(40));
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_ID", "");
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_SECRET", "");
    mocks.getUser.mockResolvedValue({ data: { user: { id, email: "operator@example.com" } }, error: null });
    mocks.isAdmin.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each([[], [id, "retry"]])("blocks mutation %j at the actual route without consuming input", async (...path) => {
    expect(isWorkshopReadOnly()).toBe(true);
    // Even an oversized or malformed payload from an old browser tab is not read.
    const request = post(path, "x".repeat(4_000_001));
    const response = await POST(request, context(path));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "workshop_read_only" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(request.bodyUsed).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("cannot be reopened by worker connection settings or browser input", async () => {
    for (const enabled of ["true", "false", ""]) {
      vi.stubEnv("RELIEF_WORKSHOP_ENABLED", enabled);
      const request = post([], '{"readOnly":false,"enabled":true}');
      request.headers.set("X-Workshop-Read-Only", "false");
      const response = await POST(request, context());
      expect(response.status).toBe(409);
      expect(request.bodyUsed).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps fresh authentication and admin checks on both reads and blocked writes", async () => {
    for (const method of ["GET", "POST"]) {
      const request = () => method === "GET" ? new Request(base) : post();
      mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
      expect((await proxyWorkshop(request(), [])).status).toBe(401);
      mocks.getUser.mockResolvedValue({ data: { user: { id, email: "other@example.com" } }, error: null });
      mocks.isAdmin.mockReturnValue(false);
      expect((await proxyWorkshop(request(), [])).status).toBe(403);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("still rejects missing or foreign origins for create and retry", async () => {
    for (const path of [[], [id, "retry"]]) {
      for (const value of [null, "https://other.example"]) {
        const request = post(path);
        if (value) request.headers.set("origin", value);
        else request.headers.delete("origin");
        const response = await POST(request, context(path));
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "same_origin_required" });
      }
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not introduce an alternate mutation path or verb", async () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect((await proxyWorkshop(new Request(base, { method }), [])).status).toBe(404);
    }
    for (const path of [[id, "retry"], ["create"], [id, "delete"], [id, "artifacts", "../secret"]]) {
      expect((await GET(new Request(`${base}/${path.join("/")}`), context(path))).status).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves list and detail reads with server-derived ownership", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ revisions: [queued], worker_online: true }));
    const request = new Request(base, { headers: { "X-Relief-Owner": "victim", Authorization: "Bearer browser-secret" } });
    const list = await GET(request, context());
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual({ revisions: [queued], worker_online: true });
    expect(fetch).toHaveBeenLastCalledWith("https://private-worker.example/revisions", expect.objectContaining({
      method: "GET", cache: "no-store", redirect: "error",
      headers: { "X-Relief-Owner": id, Authorization: `Bearer ${"x".repeat(40)}` },
    }));
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ revision: queued }));
    const detail = await GET(new Request(`${base}/${id}`), context([id]));
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({ revision: queued });
  });

  it.each([
    ["model-glb", "model/gltf-binary", "model.glb"],
    ["model-stl", "model/stl", "model.stl"],
    ["model-3mf", "model/3mf", "model.3mf"],
    ["evidence", "application/zip", "evidence.zip"],
    ["depth", "image/png", "depth.png"],
  ])("keeps verified %s bytes downloadable", async (name, contentType, filename) => {
    const bytes = `stored-${name}`;
    const hash = createHash("sha256").update(bytes).digest("hex");
    vi.mocked(fetch).mockResolvedValue(new Response(bytes, { headers: {
      "Content-Type": contentType, "Content-Length": String(bytes.length),
      "X-Artifact-SHA256": hash, "Content-Disposition": `attachment; filename="${filename}"`,
    } }));
    const path = [id, "artifacts", name];
    const response = await GET(new Request(`${base}/${path.join("/")}`), context(path));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(contentType);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-artifact-sha256")).toBe(hash);
    expect(response.headers.get("content-disposition")).toBe(`${name === "depth" ? "inline" : "attachment"}; filename="${filename}"`);
    expect(await response.text()).toBe(bytes);
  });

  it("does not turn unavailable archive reads into an empty success", async () => {
    vi.stubEnv("RELIEF_WORKSHOP_ENABLED", "false");
    const disabled = await GET(new Request(base), context());
    expect(disabled.status).toBe(503);
    expect(await disabled.json()).toEqual({ error: "workshop_not_configured" });
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("RELIEF_WORKSHOP_ENABLED", "true");
    vi.mocked(fetch).mockRejectedValue(new Error("private-upstream"));
    const failed = await GET(new Request(base), context());
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "workshop_unavailable" });
  });
});
