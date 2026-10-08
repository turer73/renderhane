import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upload: vi.fn(), client: vi.fn(), download: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.client }));
vi.mock("@/lib/security/safe-download", async (original) => ({
  ...(await original<typeof import("@/lib/security/safe-download")>()), openPublicDownload: mocks.download,
}));
import { LabDeadlineError, withinLabDeadline } from "../model-lab-deadline";
import { persistLabOutputs } from "../model-lab-storage";

describe("lab deadlines", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.upload.mockReset(); mocks.client.mockReset(); mocks.download.mockReset();
    mocks.client.mockReturnValue({ storage: { from: () => ({ upload: mocks.upload }) } });
    mocks.download.mockImplementation(async () => ({
      response: Object.assign(Readable.from([Buffer.from("output")]), { statusCode: 200, headers: { "content-type": "image/png" }, complete: true }),
      close: vi.fn(),
    }));
  });
  afterEach(() => vi.useRealTimers());

  it("returns on time even when the transport ignores abort, and consumes late rejection", async () => {
    let signal!: AbortSignal;
    let reject!: (error: Error) => void;
    const result = withinLabDeadline(Date.now() + 50, (value) => {
      signal = value;
      return new Promise<void>((_resolve, fail) => { reject = fail; });
    });
    const assertion = expect(result).rejects.toBeInstanceOf(LabDeadlineError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(signal.aborted).toBe(true);
    reject(new Error("late transport failure"));
    await Promise.resolve();
  });

  it("never starts an operation after its deadline", async () => {
    const operation = vi.fn();
    await expect(withinLabDeadline(Date.now(), operation)).rejects.toBeInstanceOf(LabDeadlineError);
    expect(operation).not.toHaveBeenCalled();
  });

  const outputs = [{ url: "https://cdn.example.com/a.png", kind: "image" as const }, { url: "https://cdn.example.com/b.png", kind: "image" as const }];
  const admin = {} as Parameters<typeof persistLabOutputs>[0];

  it("aborts a stalled upload, leaves it pending and never checkpoints a late result", async () => {
    let resolve!: (value: { error: null }) => void;
    mocks.upload.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const checkpoint = vi.fn().mockResolvedValue(true);
    const copying = persistLabOutputs(admin, { userId: "owner", runId: "run", outputs, deadline: Date.now() + 30_000, checkpoint });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await copying).toMatchObject({ state: null, fenced: false });
    expect(mocks.client.mock.calls[0][0].aborted).toBe(true);
    expect(mocks.download).toHaveBeenCalledTimes(1);
    resolve({ error: null });
    await Promise.resolve();
    expect(checkpoint).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });

  it("aborts a stalled checkpoint and never proceeds to the next output", async () => {
    mocks.upload.mockResolvedValue({ error: null });
    let signal!: AbortSignal;
    const checkpoint = vi.fn((_outputs, value?: AbortSignal) => {
      signal = value!;
      return new Promise<boolean>(() => {});
    });
    const copying = persistLabOutputs(admin, { userId: "owner", runId: "run", outputs, deadline: Date.now() + 30_000, checkpoint });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await copying).toMatchObject({ state: null, fenced: true });
    expect(signal.aborted).toBe(true);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
});
