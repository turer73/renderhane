import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { LAB_CATALOG } from "../model-lab-catalog";
import { STALE_STORAGE_MS, STALE_SUBMITTING_MS } from "../model-lab-flow";
import {
  effectiveLabStatus,
  isLabInputPath,
  isStorageRetryable,
  labRunDto,
  ownUploadPath,
  sanitizeLabInputs,
  storedPathsOf,
  type LabRunRow,
} from "../model-lab-runs";

const NOW = Date.parse("2026-10-02T12:00:00.000Z");
const SIGNED = "https://proj.supabase.co/storage/v1/object/sign/uploads/admin-a/model-lab/inputs/1-shoe.png?token=SECRET";

function row(patch: Partial<LabRunRow> = {}): LabRunRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    user_id: "admin-a",
    client_request_id: "00000000-0000-4000-8000-0000000000aa",
    model_key: "flux-kontext",
    endpoint: "fal-ai/flux-pro/kontext",
    status: "completed",
    request_id: "fal-1",
    receipt: "signed",
    inputs: [],
    outputs: [],
    storage_state: "none",
    error_code: null,
    error_message: null,
    created_at: "2026-10-02T11:00:00.000Z",
    updated_at: "2026-10-02T11:00:00.000Z",
    completed_at: null,
    expires_at: "2026-11-01T11:00:00.000Z",
    ...patch,
  };
}

describe("Model Lab history rows", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co"));
  afterEach(() => vi.unstubAllEnvs());

  it("recognises only the admin's own signed uploads on this project", () => {
    expect(ownUploadPath(SIGNED, "admin-a")).toBe("admin-a/model-lab/inputs/1-shoe.png");
    expect(ownUploadPath(SIGNED, "admin-b")).toBeNull();
    expect(ownUploadPath(SIGNED.replace("proj.supabase.co", "evil.example"), "admin-a")).toBeNull();
    expect(ownUploadPath("https://proj.supabase.co/storage/v1/object/sign/uploads/admin-a/../admin-b/x.png?token=t", "admin-a")).toBeNull();
  });

  it("keeps uploads by path and other links without their query, never a token", () => {
    const model = LAB_CATALOG.find((entry) => entry.key === "flux-kontext")!;
    const stored = sanitizeLabInputs(model, {
      image_url: SIGNED,
      prompt: `  ${"p".repeat(2500)}  `,
      unknown_field: "ignored",
    }, "admin-a");
    expect(stored).toEqual([
      { key: "image_url", kind: "upload", path: "admin-a/model-lab/inputs/1-shoe.png" },
      { key: "prompt", kind: "text", value: "p".repeat(2000) },
    ]);
    const external = sanitizeLabInputs(model, { image_url: "https://cdn.example/a.png?X-Amz-Signature=abc#frag", prompt: "" }, "admin-a");
    expect(external).toEqual([{ key: "image_url", kind: "url", url: "https://cdn.example/a.png" }]);
    expect(JSON.stringify([stored, external])).not.toMatch(/SECRET|Signature/);
  });

  it("only deletes inside the admin's lab input folder", () => {
    expect(isLabInputPath("admin-a/model-lab/inputs/1-a.png", "admin-a")).toBe(true);
    for (const path of ["admin-a/1-a.png", "admin-b/model-lab/inputs/1-a.png", "admin-a/model-lab/inputs/", "admin-a/model-lab/inputs/x/y.png", "admin-a/model-lab/inputs/..", 42]) {
      expect(isLabInputPath(path, "admin-a")).toBe(false);
    }
  });

  it("shows a submit that never got an acknowledgement as unknown after a while", () => {
    const submitting = row({ status: "submitting", created_at: new Date(NOW - STALE_SUBMITTING_MS + 1000).toISOString() });
    expect(effectiveLabStatus(submitting, NOW)).toBe("submitting");
    expect(effectiveLabStatus({ ...submitting, created_at: new Date(NOW - STALE_SUBMITTING_MS - 1).toISOString() }, NOW)).toBe("unknown");
    expect(effectiveLabStatus(row({ status: "queued", created_at: "2026-01-01T00:00:00.000Z" }), NOW)).toBe("queued");
  });

  it("allows a storage retry for failed, partial or long-stuck copies of completed runs only", () => {
    expect(isStorageRetryable(row({ storage_state: "failed" }), NOW)).toBe(true);
    expect(isStorageRetryable(row({ storage_state: "partial" }), NOW)).toBe(true);
    expect(isStorageRetryable(row({ storage_state: "pending", updated_at: new Date(NOW - 1000).toISOString() }), NOW)).toBe(false);
    expect(isStorageRetryable(row({ storage_state: "pending", updated_at: new Date(NOW - STALE_STORAGE_MS - 1).toISOString() }), NOW)).toBe(true);
    expect(isStorageRetryable(row({ storage_state: "stored" }), NOW)).toBe(false);
    expect(isStorageRetryable(row({ status: "queued", storage_state: "failed" }), NOW)).toBe(false);
  });

  it("shows stored files through fresh signed links and the rest as temporary provider links", () => {
    const value = row({
      status: "completed",
      storage_state: "partial",
      error_code: "provider_failed",
      error_message: "Sağlayıcı işi tamamlayamadı.",
      inputs: [
        { key: "image_url", kind: "upload", path: "admin-a/model-lab/inputs/1-shoe.png" },
        { key: "prompt", kind: "text", value: "red" },
        { key: "mask_url", kind: "url", url: "https://cdn.example/mask.png" },
      ],
      outputs: [
        { kind: "image", providerUrl: "https://v3.fal.media/files/a.png", path: "admin-a/model-lab/r/0.png", mime: "image/png", bytes: 1234, error: null },
        { kind: "video", providerUrl: "https://v3.fal.media/files/b.mp4", path: null, mime: null, bytes: null, error: "too_large" },
      ],
    });
    const links = new Map([
      ["admin-a/model-lab/r/0.png", { url: "https://proj.supabase.co/view?token=1", downloadUrl: "https://proj.supabase.co/view?token=1&download=" }],
      ["admin-a/model-lab/inputs/1-shoe.png", { url: "https://proj.supabase.co/in?token=2", downloadUrl: "https://proj.supabase.co/in?token=2&download=" }],
    ]);
    const dto = labRunDto(value, links, NOW);
    expect(dto.outputs).toEqual([
      { kind: "image", stored: true, url: "https://proj.supabase.co/view?token=1", downloadUrl: "https://proj.supabase.co/view?token=1&download=", bytes: 1234, mime: "image/png" },
      { kind: "video", stored: false, url: "https://v3.fal.media/files/b.mp4", downloadUrl: "https://v3.fal.media/files/b.mp4", bytes: null, mime: null },
    ]);
    expect(dto.inputs).toEqual([
      { key: "image_url", kind: "upload", url: "https://proj.supabase.co/in?token=2" },
      { key: "prompt", kind: "text", value: "red" },
      { key: "mask_url", kind: "url", url: "https://cdn.example/mask.png" },
    ]);
    expect(dto).toMatchObject({ storage: "partial", errorCode: "provider_failed", linksExpireAt: NOW + 3_600_000, modelName: LAB_CATALOG.find((entry) => entry.key === "flux-kontext")!.name });
    // The DTO carries no receipt, user id or attempt id.
    expect(JSON.stringify(dto)).not.toMatch(/"receipt"|admin-a"|client_request_id|0000000000aa/);
    expect(storedPathsOf(value)).toEqual(["admin-a/model-lab/r/0.png", "admin-a/model-lab/inputs/1-shoe.png"]);
  });
});
