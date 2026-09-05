import type { WorkshopArtifact, WorkshopRevision } from "./workshop";

export const WORKSHOP_MAX_ARTIFACT = 128 * 1024 * 1024;
export const WORKSHOP_ARTIFACT_TYPES = ["image/png", "application/json", "application/zip", "model/gltf-binary", "model/stl", "model/3mf"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const hash = /^[0-9a-f]{64}$/;
function requireValue(condition: unknown): asserts condition {
  if (!condition) throw new Error("invalid_worker_response");
}
function record(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max);
  return value;
}
function text(value: unknown, max = 512): string {
  requireValue(typeof value === "string" && value.length <= max);
  return value;
}
function texts(value: unknown): string[] {
  requireValue(Array.isArray(value) && value.length <= 200);
  return value.map((item) => text(item));
}

function coverage(value: unknown): Record<string, unknown> {
  const data = record(value);
  const layers = record(data.layers);
  const layerNames = ["uv_artwork", "white_mask", "varnish_mask"];
  const statuses = ["pass", "fail", "not_evaluable"];
  const overallStatus = text(data.layer_coverage_status, 32);
  requireValue(statuses.includes(overallStatus));
  for (const name of layerNames) requireValue(Object.hasOwn(layers, name));
  const projected: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(layers)) {
    requireValue(layerNames.includes(name));
    const layer = record(raw);
    const status = text(layer.status, 32);
    requireValue(statuses.includes(status));
    const item: Record<string, unknown> = { status };
    for (const field of ["outside_silhouette_pixels", "outside_silhouette_area_mm2", "max_nearest_silhouette_distance_mm"]) {
      if (layer[field] !== undefined) item[field] = number(layer[field]);
    }
    projected[name] = item;
  }
  return { layer_coverage_status: overallStatus, layers: projected };
}

function result(value: unknown): NonNullable<WorkshopRevision["result"]> {
  const data = record(value);
  requireValue(["ready", "needs_review", "failed"].includes(text(data.digital_geometry_status, 32)));
  // A new wire value cannot grant semantic or physical approval in this pilot.
  requireValue(data.artwork_semantic_registration_status === "not_validated" &&
    data.physical_validation_status === "pending" && data.production_status === "not_approved");
  const artifacts: Record<string, WorkshopArtifact> = {};
  const entries = Object.entries(record(data.artifacts));
  requireValue(entries.length <= 32);
  for (const [name, raw] of entries) {
    requireValue(/^[a-z0-9-]{1,40}$/.test(name));
    const artifact = record(raw);
    const bytes = number(artifact.bytes, 1, WORKSHOP_MAX_ARTIFACT);
    const sha256 = text(artifact.sha256, 64);
    const content_type = text(artifact.content_type, 64);
    requireValue(Number.isSafeInteger(bytes) && hash.test(sha256) && WORKSHOP_ARTIFACT_TYPES.includes(content_type));
    artifacts[name] = { bytes, sha256, content_type };
  }
  for (const name of ["model-glb", "model-stl", "model-3mf", "depth", "silhouette", "evidence", "registration", "layer-coverage"]) {
    requireValue(Object.hasOwn(artifacts, name));
  }
  return {
    digital_geometry_status: text(data.digital_geometry_status),
    digital_failures: texts(data.digital_failures), digital_warnings: texts(data.digital_warnings),
    artwork_file_set_status: text(data.artwork_file_set_status, 64),
    artwork_semantic_registration_status: "not_validated", physical_validation_status: "pending", production_status: "not_approved",
    physical_width_mm: number(data.physical_width_mm, 20, 140), physical_height_mm: number(data.physical_height_mm, Number.EPSILON, 140),
    coverage: coverage(data.coverage), artifacts,
  };
}

function revision(value: unknown): WorkshopRevision {
  const data = record(value);
  const id = text(data.id, 36), spec_hash = text(data.spec_hash, 64);
  requireValue(uuid.test(id) && hash.test(spec_hash));
  const state = text(data.state, 16);
  requireValue(["queued", "running", "completed", "failed"].includes(state));
  const attempts = number(data.attempts, 0, 3);
  requireValue(Number.isSafeInteger(attempts));
  const spec = record(data.spec), recipe = record(spec.recipe);
  const depth = number(recipe.relief_depth_mm);
  requireValue([0.6, 1, 1.4, 1.8].includes(depth) && recipe.base_thickness_mm === 3);
  const completed = data.result === null ? null : result(data.result);
  requireValue((state === "completed") === (completed !== null));
  return {
    id, spec_hash, state: state as WorkshopRevision["state"], attempts,
    created_at: number(data.created_at), error: data.error === null ? null : text(data.error),
    spec: { recipe: { width_mm: number(recipe.width_mm, 20, 140), relief_depth_mm: depth, base_thickness_mm: 3 },
      sample: spec.sample === null ? null : text(spec.sample, 64) }, result: completed,
  };
}

/** Validate the route-specific wire contract, then project only public UI fields. */
export function parseWorkshopReply(value: unknown, parts: string[], method: string) {
  const data = record(value);
  if (!parts.length && method === "GET") {
    requireValue(Array.isArray(data.revisions) && data.revisions.length <= 50 && typeof data.worker_online === "boolean");
    const revisions = data.revisions.map(revision);
    requireValue(new Set(revisions.map((item) => item.id)).size === revisions.length);
    return { revisions, worker_online: data.worker_online };
  }
  const item = revision(data.revision);
  if (parts.length) requireValue(item.id === parts[0]);
  if (!parts.length && method === "POST") {
    requireValue(typeof data.deduplicated === "boolean");
    return { revision: item, deduplicated: data.deduplicated };
  }
  return { revision: item };
}
