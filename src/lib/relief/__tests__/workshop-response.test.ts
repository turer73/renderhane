import { describe, expect, it } from "vitest";
import { parseWorkshopReply } from "../workshop-response";
import { LEGACY_WORKSHOP_ENGINE_SHA256 } from "../workshop";

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
    artifacts: {
      "model-glb": { bytes: 3, sha256: "b".repeat(64), content_type: "model/gltf-binary" },
      "model-stl": { bytes: 3, sha256: "b".repeat(64), content_type: "model/stl" },
      "model-3mf": { bytes: 3, sha256: "b".repeat(64), content_type: "model/3mf" },
      depth: { bytes: 3, sha256: "b".repeat(64), content_type: "image/png" },
      silhouette: { bytes: 3, sha256: "b".repeat(64), content_type: "image/png" },
      evidence: { bytes: 3, sha256: "b".repeat(64), content_type: "application/zip" },
      registration: { bytes: 3, sha256: "b".repeat(64), content_type: "application/json" },
      "layer-coverage": { bytes: 3, sha256: "b".repeat(64), content_type: "application/json" },
      "cut-contour": { bytes: 3, sha256: "b".repeat(64), content_type: "image/svg+xml" },
    },
  } };
}

const legacyArtifactContentTypes: Record<string, string> = {
  candidate: "application/zip", depth: "image/png", difference: "image/png", evidence: "application/zip",
  "layer-coverage": "application/json", manifest: "application/json", "model-3mf": "model/3mf",
  "model-glb": "model/gltf-binary", "model-stl": "model/stl", overlay: "image/png",
  registration: "application/json", revision: "application/json", silhouette: "image/png",
  "uv-artwork": "image/png", "varnish-mask": "image/png", "white-mask": "image/png",
};

function legacyCompleted() {
  const source = completed();
  const artifacts = Object.fromEntries(Object.entries(legacyArtifactContentTypes).map(([name, content_type]) => [name, {
    bytes: 3, sha256: "b".repeat(64), content_type,
  }]));
  return { ...source, spec: { ...source.spec, engine_sha256: LEGACY_WORKSHOP_ENGINE_SHA256 }, result: {
    ...source.result,
    artifacts,
    artifact_contract_status: "legacy_missing_cut_contour",
  } };
}

describe("workshop public response contract", () => {
  it("accepts only the exact legacy raw contract and never invents a contour", () => {
    const item = legacyCompleted();
    const parsed = parseWorkshopReply({ revision: item }, [id], "GET").revision;
    expect(parsed?.result?.artifact_contract_status).toBe("legacy_missing_cut_contour");
    expect(parsed?.result?.artifacts).not.toHaveProperty("cut-contour");
    expect(parsed?.spec).not.toHaveProperty("engine_sha256");

    const wrongEngine = { ...item, spec: { ...item.spec, engine_sha256: "wrong" } };
    const superset = { ...item, result: { ...item.result, artifacts: {
      ...item.result.artifacts, "extra-artifact": item.result.artifacts.candidate,
    } } };
    const missingArtifact = { ...item, result: { ...item.result, artifacts: Object.fromEntries(
      Object.entries(item.result.artifacts).filter(([name]) => name !== "candidate"),
    ) } };
    const markerMissing = { ...item, result: { ...item.result, artifact_contract_status: undefined } };
    for (const invalid of [wrongEngine, superset, missingArtifact, markerMissing]) {
      expect(() => parseWorkshopReply({ revision: invalid }, [id], "GET")).toThrow("invalid_worker_response");
    }
  });

  it("accepts only the explicitly marked legacy result without inventing a contour", () => {
    const item = legacyCompleted();
    const parsed = parseWorkshopReply({ revision: item }, [id], "GET").revision;
    expect(parsed?.result?.artifact_contract_status).toBe("legacy_missing_cut_contour");
    expect(parsed?.result?.artifacts).not.toHaveProperty("cut-contour");
    const unmarked = { ...item, result: { ...item.result, artifact_contract_status: undefined } };
    expect(() => parseWorkshopReply({ revision: unmarked }, [id], "GET")).toThrow("invalid_worker_response");
  });

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
  it("fails closed on unsupported semantic or physical approval claims", () => {
    for (const change of [
      { artwork_semantic_registration_status: "surprisingly_ok" }, { physical_validation_status: "approved" },
      { production_status: "production_ready" }, { digital_geometry_status: "surprisingly_ok" },
    ]) expect(() => parseWorkshopReply({ revision: { ...completed(), result: { ...completed().result, ...change } } }, [id], "GET")).toThrow();
  });
  it("accepts semantic pass/fail only with the complete hashed evidence bundle", () => {
    for (const status of ["validated", "failed"] as const) {
      const item = completed();
      Object.assign(item.result, {
        artwork_semantic_registration_status: status,
        artifacts: {
          ...item.result.artifacts,
          "semantic-registration": { bytes: 3, sha256: "b".repeat(64), content_type: "application/json" },
          "geometry-semantic-ids": { bytes: 3, sha256: "b".repeat(64), content_type: "image/png" },
          "artwork-semantic-ids": { bytes: 3, sha256: "b".repeat(64), content_type: "image/png" },
          "semantic-overlay": { bytes: 3, sha256: "b".repeat(64), content_type: "image/png" },
          "semantic-difference": { bytes: 3, sha256: "b".repeat(64), content_type: "image/png" },
        },
      });
      const parsed = parseWorkshopReply({ revision: item }, [id], "GET");
      if (!("revision" in parsed) || !parsed.revision) throw new Error("expected revision");
      expect(parsed.revision.result?.artwork_semantic_registration_status).toBe(status);
    }
    const unsupportedClaim = completed();
    Object.assign(unsupportedClaim.result, { artwork_semantic_registration_status: "validated" });
    expect(() => parseWorkshopReply({ revision: unsupportedClaim }, [id], "GET")).toThrow("invalid_worker_response");
    const partialEvidence = completed();
    Object.assign(partialEvidence.result, { artifacts: {
      ...partialEvidence.result.artifacts,
      "semantic-registration": { bytes: 3, sha256: "b".repeat(64), content_type: "application/json" },
    } });
    expect(() => parseWorkshopReply({ revision: partialEvidence }, [id], "GET")).toThrow("invalid_worker_response");
  });
  it("allows omitted optional artwork coverage but keeps geometry and reported coverage fail-closed", () => {
    const source = completed().result.coverage;
    for (const missing of ["uv_artwork", "white_mask", "varnish_mask"]) {
      const item = completed();
      Object.assign(item.result, { coverage: { ...source, layers: Object.fromEntries(
        Object.entries(source.layers).filter(([name]) => name !== missing),
      ) } });
      expect(parseWorkshopReply({ revision: item }, [id], "GET").revision?.result?.coverage.layers).not.toHaveProperty(missing);
    }
    for (const change of [
      { layer_coverage_status: "approved" },
      { layers: { unknown: { status: "pass" } } },
      { layers: { uv_artwork: { status: "approved" } } },
    ]) {
      const item = completed();
      Object.assign(item.result, { coverage: { ...source, ...change } });
      expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow("invalid_worker_response");
    }
    const item = completed();
    Object.assign(item.result, { digital_geometry_status: undefined });
    expect(() => parseWorkshopReply({ revision: item }, [id], "GET")).toThrow("invalid_worker_response");
  });
  it("rejects invalid artifact hashes/types/sizes and non-numeric coverage", () => {
    for (const change of [{ sha256: "invalid" }, { bytes: 0 }, { bytes: 134217729 }, { content_type: "image/svg+xml" }, { content_type: "application/json" }]) {
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
