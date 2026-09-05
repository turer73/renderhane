import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), isAdmin: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/lib/auth/admin-check", () => ({ isAdmin: mocks.isAdmin }));
import { proxyWorkshop, workshopConfig } from "../workshop-server";
import { readBoundedBody, workshopWorkerPath } from "../workshop";

const id = "00000000-0000-4000-8000-000000000001";
const base = "https://www.renderhane.com/api/relief/workshop";
const queued = { id, spec_hash: "a".repeat(64), state: "queued", attempts: 0, created_at: 1,
  error: null, spec: { recipe: { width_mm: 70, relief_depth_mm: 1, base_thickness_mm: 3 }, sample: null }, result: null };
function request(body = "{}", origin = "https://www.renderhane.com") {
  return new Request(base, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body });
}

describe("private Relief Pro workshop", () => {
  beforeEach(() => {
    vi.stubEnv("RELIEF_WORKSHOP_ENABLED", "true");
    vi.stubEnv("RELIEF_WORKSHOP_URL", "https://private-worker.example");
    vi.stubEnv("RELIEF_WORKSHOP_TOKEN", "x".repeat(40));
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_ID", "");
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_SECRET", "");
    mocks.getUser.mockResolvedValue({ data: { user: { id, email: "operator@example.com" } }, error: null });
    mocks.isAdmin.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ revisions: [], worker_online: true })));
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("allows only explicit paths and verbs", () => {
    expect(workshopWorkerPath([], "GET")).toBe("/revisions");
    expect(workshopWorkerPath([id, "artifacts", "model-glb"], "GET")).toBe(`/revisions/${id}/artifacts/model-glb`);
    for (const parts of [[".."], [id, "artifacts", "../secrets"], [id, "artifacts", "https://evil.example"], [id, "retry", "extra"]]) {
      expect(workshopWorkerPath(parts, "GET")).toBeNull();
    }
    expect(workshopWorkerPath([], "DELETE")).toBeNull();
  });
  it("requires a fresh user and server-side admin authorization before contacting the worker", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await proxyWorkshop(request(), [])).status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: { id, email: "other@example.com" } }, error: null });
    mocks.isAdmin.mockReturnValue(false);
    expect((await proxyWorkshop(request(), [])).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("fails closed while disabled or incompletely configured", async () => {
    vi.stubEnv("RELIEF_WORKSHOP_ENABLED", "false");
    expect((await proxyWorkshop(new Request(base), [])).status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv("RELIEF_WORKSHOP_ENABLED", "true");
    vi.stubEnv("RELIEF_WORKSHOP_TOKEN", "short");
    expect(workshopConfig()).toBeNull();
    vi.stubEnv("RELIEF_WORKSHOP_TOKEN", "x".repeat(40));
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_ID", "0123456789abcdef0123456789abcdef.access");
    expect(workshopConfig()).toBeNull();
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_SECRET", "s".repeat(48));
    expect(workshopConfig()).not.toBeNull();
  });
  it("never allows insecure production transport, embedded credentials or URL paths", () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const address of ["http://127.0.0.1:8421", "https://u:p@example.com", "https://example.com/admin", "https://example.com/?q=x"]) {
      vi.stubEnv("RELIEF_WORKSHOP_URL", address);
      expect(workshopConfig()).toBeNull();
    }
  });
  it("rejects cross-origin writes, including retries", async () => {
    expect((await proxyWorkshop(request("{}", "https://evil.example"), [])).status).toBe(403);
    expect((await proxyWorkshop(new Request(`${base}/${id}/retry`, { method: "POST" }), [id, "retry"])).status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("bounds real bytes, not only content-length", async () => {
    expect((await proxyWorkshop(request("x".repeat(4_000_001)), [])).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
    await expect(readBoundedBody(new Response("abcd").body, 3)).rejects.toThrow("request_too_large");
  });
  it("forwards the authenticated owner, never a browser-supplied owner or credential", async () => {
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_ID", "service-client-id.access");
    vi.stubEnv("RELIEF_WORKSHOP_ACCESS_CLIENT_SECRET", "s".repeat(48));
    vi.mocked(fetch).mockResolvedValue(Response.json({ revision: queued, deduplicated: false }));
    const req = request();
    req.headers.set("X-Relief-Owner", "victim");
    req.headers.set("Authorization", "Bearer browser-secret");
    req.headers.set("CF-Access-Client-Id", "browser-client");
    req.headers.set("CF-Access-Client-Secret", "browser-secret");
    expect((await proxyWorkshop(req, [])).status).toBe(200);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({
      "X-Relief-Owner": id,
      Authorization: `Bearer ${"x".repeat(40)}`,
      "CF-Access-Client-Id": "service-client-id.access",
      "CF-Access-Client-Secret": "s".repeat(48),
    });
    expect(init?.redirect).toBe("error");
    expect(init?.cache).toBe("no-store");
  });
  it("does not turn worker failure into a successful empty list", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("internal-secret-host"));
    const response = await proxyWorkshop(new Request(base), []);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("internal-secret-host");
  });
  it("filters freeform upstream errors and rejects non-protocol JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: "private-path-or-credential" }, { status: 400 }));
    const failed = await proxyWorkshop(new Request(base), []);
    expect(failed.status).toBe(400);
    expect(await failed.text()).not.toContain("private-path-or-credential");
    vi.mocked(fetch).mockResolvedValue(Response.json({ unexpected: "private" }));
    expect((await proxyWorkshop(new Request(base), [])).status).toBe(502);
  });
  it("proxies only bounded known artifact content types, never active SVG or HTML", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml", "Content-Length": "6" } }));
    const response = await proxyWorkshop(new Request(`${base}/${id}/artifacts/model-glb`), [id, "artifacts", "model-glb"]);
    expect(response.status).toBe(502);
  });
  it("keeps images private while allowing same-origin inline inspection", async () => {
    const sha = createHash("sha256").update("png").digest("hex");
    vi.mocked(fetch).mockResolvedValue(new Response("png", { headers: {
      "Content-Type": "image/png", "Content-Length": "3", "Content-Disposition": 'attachment; filename="silhouette.png"',
      "X-Artifact-SHA256": sha,
    } }));
    const response = await proxyWorkshop(new Request(`${base}/${id}/artifacts/silhouette`), [id, "artifacts", "silhouette"]);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toBe('inline; filename="silhouette.png"');
    expect(response.headers.get("x-artifact-sha256")).toBe(sha);
    expect(await response.text()).toBe("png");
  });
  it("rejects malformed nested revisions and route/response mismatches", async () => {
    for (const body of [{ revisions: [{}], worker_online: true }, { revision: queued }, { revisions: [], worker_online: "yes" }]) {
      vi.mocked(fetch).mockResolvedValue(Response.json(body));
      expect((await proxyWorkshop(new Request(base), [])).status).toBe(502);
    }
    vi.mocked(fetch).mockResolvedValue(Response.json({ revisions: [], worker_online: true }));
    expect((await proxyWorkshop(request(), [])).status).toBe(502);
  });
  it("rejects corrupt JSON and strips undeclared fields from a valid reply", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("{", { headers: { "content-type": "application/json" } }));
    expect((await proxyWorkshop(new Request(base), [])).status).toBe(502);
    vi.mocked(fetch).mockResolvedValue(Response.json({ revisions: [{ ...queued, owner: "private-owner" }], worker_online: true, internal: "private-host" }));
    const response = await proxyWorkshop(new Request(base), []);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revisions: [queued], worker_online: true });
  });
  it("requires a digest and a decimal length before exposing an artifact", async () => {
    const headerCases: Record<string, string>[] = [
      { "Content-Length": "3" },
      { "Content-Length": "3e0", "X-Artifact-SHA256": "a".repeat(64) },
      { "Content-Length": "134217729", "X-Artifact-SHA256": "a".repeat(64) },
    ];
    for (const headers of headerCases) {
      vi.mocked(fetch).mockResolvedValue(new Response("png", { headers: { "Content-Type": "image/png", ...headers } }));
      expect((await proxyWorkshop(new Request(base), [id, "artifacts", "depth"])).status).toBe(502);
    }
  });
  it("ties upstream cancellation to the client and budgets long bounded downloads", async () => {
    const client = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const sha = createHash("sha256").update("png").digest("hex");
    vi.mocked(fetch).mockResolvedValue(new Response("png", { headers: { "Content-Type": "image/png", "Content-Length": "3", "X-Artifact-SHA256": sha } }));
    const response = await proxyWorkshop(new Request(base, { signal: client.signal }), [id, "artifacts", "depth"]);
    expect(timeout).toHaveBeenCalledWith(270_000);
    const init = vi.mocked(fetch).mock.calls[0][1];
    client.abort();
    expect(init?.signal?.aborted).toBe(true);
    await response.body?.cancel();
    timeout.mockRestore();
  });
});
