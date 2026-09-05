import { describe, expect, it } from "vitest";
import { parseWorkshopReply } from "../workshop-response";

const id = "00000000-0000-4000-8000-000000000001";
const queued = { id, spec_hash: "a".repeat(64), state: "queued", attempts: 0, created_at: 1,
  error: null, spec: { recipe: { width_mm: 70, relief_depth_mm: 1, base_thickness_mm: 3 }, sample: null }, result: null };
function completed() {
  return { ...queued, state: "completed", attempts: 1, result: {
    digital_geometry_status: "ready", digital_failures: [], digital_warnings: [], artwork_file_set_status: "complete",
    artwork_semantic_registration_status: "not_validated", physical_validation_status: "pending", production_status: "not_approved",
    physical_width_mm: 70, physical_height_mm: 60,
    coverage: { layer_coverage_status: "pass", layers: {
      uv_artwork: { status: "pass", outside_silhouette_pixels: 0, outside_silhouette_area_mm2: 0, max_nearest_silhouette_distance_mm: 0 },
      white_mask: { status: "not_evaluable" }, varnish_mask: { status: "not_evaluable" },
    } },
    artifacts: Object.fromEntries(["model-glb", "model-stl", "model-3mf", "depth", "silhouette", "evidence", "registration", "layer-coverage"].map((name) =>
      [name, { bytes: 3, sha256: "b".repeat(64), content_type: "application/json" }])),
  } };
}

describe("workshop public response contract", () => {
  it("accepts the four lifecycle states without promoting physical or semantic status", () => {
    for (const item of [queued, { ...queued, state: "running", attempts: 1 }, { ...queued, state: "failed", attempts: 3, error: "build_timeout" }, completed()]) {
      expect(parseWorkshopReply({ revision: item }, [id], "GET")).toEqual({ revision: item });
    }
  });
  it("requires complete nested data and finite numeric metrics", () => {
    for (const item of [
      { ...queued, spec: {} }, { ...queued, attempts: 1.5 }, { ...queued, state: "completed" },
      { ...completed(), result: { ...completed().result, coverage: {} } },
      { ...completed(), result: { ...completed().result, physical_width_mm: "70" } },
      { ...completed(), result: { ...completed().result, physical_height_mm: NaN } },
      { ...completed(), result: { ...completed().result, artifacts: {} } },
    ]) expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow("invalid_worker_response");
  });
  it("fails closed on future semantic/physical approval claims", () => {
    for (const change of [
      { artwork_semantic_registration_status: "validated" }, { physical_validation_status: "approved" },
      { production_status: "production_ready" }, { digital_geometry_status: "surprisingly_ok" },
    ]) expect(() => parseWorkshopReply({ revision: { ...completed(), result: { ...completed().result, ...change } } }, [id], "GET")).toThrow();
  });
  it("requires all coverage layers and a recognized overall status", () => {
    const source = completed().result.coverage;
    for (const missing of ["uv_artwork", "white_mask", "varnish_mask"]) {
      const item = completed();
      Object.assign(item.result, { coverage: { ...source, layers: Object.fromEntries(
        Object.entries(source.layers).filter(([name]) => name !== missing),
      ) } });
      expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow("invalid_worker_response");
    }
    const item = completed();
    item.result.coverage.layer_coverage_status = "approved";
    expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow("invalid_worker_response");
  });
  it("rejects invalid artifact hashes/types/sizes and non-numeric coverage", () => {
    for (const change of [{ sha256: "invalid" }, { bytes: 0 }, { bytes: 134217729 }, { content_type: "image/svg+xml" }]) {
      const item = completed();
      Object.assign(item.result.artifacts["model-glb"], change);
      expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow();
    }
    const item = completed();
    Object.assign(item.result.coverage.layers.uv_artwork, { outside_silhouette_area_mm2: "0" });
    expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow();
  });
  it("requires matching revision IDs and route-specific response shapes", () => {
    expect(() => parseWorkshopReply({ revision: queued }, [], "GET")).toThrow();
    expect(() => parseWorkshopReply({ revisions: [], worker_online: true }, [], "POST")).toThrow();
    expect(() => parseWorkshopReply({ revision: queued }, [], "POST")).toThrow();
    expect(() => parseWorkshopReply({ revision: queued }, ["00000000-0000-4000-8000-000000000002"], "GET")).toThrow();
    expect(parseWorkshopReply({ revision: queued, deduplicated: true }, [], "POST")).toEqual({ revision: queued, deduplicated: true });
    expect(() => parseWorkshopReply({ revisions: [queued, queued], worker_online: true }, [], "GET")).toThrow();
  });
  it("does not expose internal fields or artifact paths from upstream JSON", () => {
    const item = completed();
    Object.assign(item, { owner: "private-owner", payload: { private: true } });
    Object.assign(item.result.artifacts["model-glb"], { path: "/private/artifact" });
    const reply = parseWorkshopReply({ revision: item, private: "upstream" }, [id], "GET");
    expect(JSON.stringify(reply)).not.toContain("private");
    expect(reply.revision?.result?.artifacts["model-glb"].sha256).toBe("b".repeat(64));
  });
});
