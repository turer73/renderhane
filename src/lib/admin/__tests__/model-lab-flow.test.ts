import { describe, expect, it } from "vitest";
import {
  isDeletableRun,
  isLabUuid,
  LAB_LINK_REFRESH_MARGIN_MS,
  LAB_POLL_MS,
  labPhase,
  mergeLabRuns,
  needsPolling,
  pollBackoffMs,
  providerStatusToRun,
  removeLabRun,
  runsDueForPoll,
  runsWithExpiringLinks,
  type LabRunDto,
} from "../model-lab-flow";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");

function run(id: string, patch: Partial<LabRunDto> = {}): LabRunDto {
  return {
    id,
    modelKey: "flux-kontext",
    modelName: "FLUX Kontext",
    endpoint: "fal-ai/flux-pro/kontext",
    status: "queued",
    requestId: `request-${id}`,
    createdAt: "2026-10-02T11:00:00.000Z",
    updatedAt: "2026-10-02T11:00:00.000Z",
    completedAt: null,
    expiresAt: "2026-11-01T11:00:00.000Z",
    inputs: [],
    outputs: [],
    storage: "none",
    error: null,
    errorCode: null,
    linksExpireAt: NOW + 3_600_000,
    ...patch,
  };
}

describe("Model Lab progress phases", () => {
  it("shows local work before the server's run state", () => {
    const queued = run("a");
    expect(labPhase({ uploading: true, validating: true, submitting: true, run: queued })).toBe("uploading");
    expect(labPhase({ uploading: false, validating: true, submitting: true, run: queued })).toBe("validating");
    expect(labPhase({ uploading: false, validating: false, submitting: true, run: null })).toBe("queue");
  });

  it.each([
    ["submitting", "queue"],
    ["queued", "queue"],
    ["running", "running"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["unknown", "unknown"],
  ] as const)("maps a %s run to the %s step", (status, phase) => {
    expect(labPhase({ uploading: false, validating: false, submitting: false, run: run("a", { status }) })).toBe(phase);
  });

  it("is idle without an attempt", () => {
    expect(labPhase({ uploading: false, validating: false, submitting: false, run: null })).toBe("idle");
  });
});

describe("Model Lab history merging", () => {
  it("never lets a response that arrives late roll a run back", () => {
    const completed = run("a", { status: "completed", updatedAt: "2026-10-02T11:05:00.000Z" });
    const lateQueued = run("a", { status: "queued", updatedAt: "2026-10-02T11:01:00.000Z" });
    expect(mergeLabRuns([completed], [lateQueued])).toEqual([completed]);
  });

  it("takes a fresh read of the same version, e.g. new signed links", () => {
    const old = run("a", { linksExpireAt: NOW });
    const fresh = run("a", { linksExpireAt: NOW + 3_600_000 });
    expect(mergeLabRuns([old], [fresh])[0].linksExpireAt).toBe(NOW + 3_600_000);
  });

  it("keeps every earlier run when a new one arrives, newest first", () => {
    const older = run("a", { createdAt: "2026-10-01T10:00:00.000Z" });
    const newer = run("b", { createdAt: "2026-10-02T10:00:00.000Z" });
    const merged = mergeLabRuns([older], [newer]);
    expect(merged.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(removeLabRun(merged, "b").map((entry) => entry.id)).toEqual(["a"]);
  });
});

describe("Model Lab polling", () => {
  it("polls only runs whose server state can still change", () => {
    expect(needsPolling({ status: "submitting", storage: "none" })).toBe(true);
    expect(needsPolling({ status: "queued", storage: "none" })).toBe(true);
    expect(needsPolling({ status: "running", storage: "none" })).toBe(true);
    expect(needsPolling({ status: "completed", storage: "pending" })).toBe(true);
    expect(needsPolling({ status: "completed", storage: "stored" })).toBe(false);
    expect(needsPolling({ status: "failed", storage: "none" })).toBe(false);
    // An unknown run is never polled into a resubmission; the admin resolves it.
    expect(needsPolling({ status: "unknown", storage: "none" })).toBe(false);
  });

  it("backs off after failures, capped at a minute", () => {
    expect(pollBackoffMs(0)).toBe(LAB_POLL_MS);
    expect(pollBackoffMs(1)).toBe(LAB_POLL_MS * 2);
    expect(pollBackoffMs(3)).toBe(LAB_POLL_MS * 8);
    expect(pollBackoffMs(20)).toBe(60_000);
  });

  it("skips runs that are backing off and caps one tick", () => {
    const runs = Array.from({ length: 9 }, (_, index) => run(String(index)));
    const due = runsDueForPoll(runs, NOW, { "0": { failures: 2, nextAt: NOW + 1000 } });
    expect(due.map((entry) => entry.id)).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(runsDueForPoll(runs, NOW + 1000, { "0": { failures: 2, nextAt: NOW + 1000 } })[0].id).toBe("0");
  });

  it("refreshes only signed storage links that are about to expire", () => {
    const stored = { kind: "image" as const, stored: true, url: "https://proj.supabase.co/x", downloadUrl: "https://proj.supabase.co/x", bytes: 1, mime: "image/png" };
    const provider = { ...stored, stored: false, url: "https://v3.fal.media/x", downloadUrl: "https://v3.fal.media/x" };
    const soon = NOW + LAB_LINK_REFRESH_MARGIN_MS - 1;
    const runs = [
      run("stored-soon", { outputs: [stored], linksExpireAt: soon }),
      run("stored-later", { outputs: [stored], linksExpireAt: NOW + LAB_LINK_REFRESH_MARGIN_MS + 1 }),
      run("provider-soon", { outputs: [provider], linksExpireAt: soon }),
      run("upload-soon", { inputs: [{ key: "image_url", kind: "upload", url: "https://proj.supabase.co/in" }], linksExpireAt: soon }),
    ];
    expect(runsWithExpiringLinks(runs, NOW).map((entry) => entry.id)).toEqual(["stored-soon", "upload-soon"]);
  });
});

describe("Model Lab run rules", () => {
  it("deletes only finished runs: active or unknown ones may still be charging", () => {
    expect(isDeletableRun("completed")).toBe(true);
    expect(isDeletableRun("failed")).toBe(true);
    for (const status of ["submitting", "queued", "running", "unknown"] as const) expect(isDeletableRun(status)).toBe(false);
  });

  it("maps provider queue states and rejects anything else", () => {
    expect(providerStatusToRun("IN_QUEUE")).toBe("queued");
    expect(providerStatusToRun("IN_PROGRESS")).toBe("running");
    expect(providerStatusToRun("COMPLETED")).toBe("completed");
    expect(providerStatusToRun("CANCELLED")).toBe("failed");
    expect(providerStatusToRun("SOMETHING_NEW")).toBeNull();
    expect(providerStatusToRun(undefined)).toBeNull();
  });

  it("accepts only canonical UUIDs as attempt and run ids", () => {
    expect(isLabUuid("3f2b8c1e-9d4a-4c5b-8e7f-1a2b3c4d5e6f")).toBe(true);
    expect(isLabUuid("not-a-uuid")).toBe(false);
    expect(isLabUuid("3f2b8c1e-9d4a-4c5b-8e7f-1a2b3c4d5e6f\n")).toBe(false);
    expect(isLabUuid(42)).toBe(false);
  });
});
