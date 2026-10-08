import { afterEach, describe, expect, it, vi } from "vitest";
import { clearLabRun, parseLabRun, readLabRun, type LabRun } from "../model-lab-session";

const run: LabRun = { modelKey: "meshy-v71", startedAt: 1_800_000_000_000, status: "IN_QUEUE", receipt: "signed-receipt", requestId: "request-1" };
afterEach(() => vi.unstubAllGlobals());
describe("model lab browser recovery", () => {
  it("recovers a pending request without submitting anything", () => {
    expect(parseLabRun(JSON.stringify(run))).toEqual({ ...run, outputs: [] });
  });
  it("keeps uncertain submissions locked across reload", () => {
    expect(parseLabRun(JSON.stringify({ ...run, receipt: undefined, status: "UNKNOWN" }))?.status).toBe("UNKNOWN");
  });
  it.each([null, "{", "null", "[]", "x".repeat(100_001), JSON.stringify({ ...run, receipt: undefined }), JSON.stringify({ ...run, receipt: "x".repeat(8193) }), JSON.stringify({ ...run, status: "constructor" })])("rejects corrupt stored state %#", (raw) => {
    expect(parseLabRun(raw)).toBeNull();
  });
  it("never restores arbitrary source fields or executable output links", () => {
    const parsed = parseLabRun(JSON.stringify({ ...run, prompt: "secret prompt", image_url: "https://source.example/x", outputs: [{ url: "javascript:alert(1)", kind: "file" }, { url: "https://cdn.example/out.glb", kind: "glb" }] }));
    expect(parsed).not.toHaveProperty("prompt");
    expect(parsed).not.toHaveProperty("image_url");
    expect(parsed?.outputs).toEqual([{ url: "https://cdn.example/out.glb", kind: "glb" }]);
  });
  it("partitions recovery by signed-in user and clears only that user's run", () => {
    const storage = new Map<string, string>([
      ["renderhane:model-lab:v1:admin-a", JSON.stringify(run)],
      ["renderhane:model-lab:v1:admin-b", JSON.stringify({ ...run, requestId: "request-b" })],
    ]);
    vi.stubGlobal("localStorage", { getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key) });
    expect(readLabRun("admin-a")?.requestId).toBe(run.requestId);
    expect(readLabRun("admin-c")).toBeNull();
    clearLabRun("admin-a");
    expect(readLabRun("admin-a")).toBeNull();
    expect(readLabRun("admin-b")?.requestId).toBe("request-b");
  });
  it("tolerates blocked browser storage without breaking the page", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } });
    expect(readLabRun("admin-a")).toBeNull();
    expect(() => clearLabRun("admin-a")).not.toThrow();
  });
});
