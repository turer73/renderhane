/** Public wire types only. No worker address, credential or native processing. */
export const WORKSHOP_MAX_BODY = 4_000_000;
export const WORKSHOP_LAYERS = [
  "relief_map", "mask", "uv_artwork", "white_mask", "varnish_mask",
  "geometry_semantic_ids", "artwork_semantic_ids",
] as const;
/** Known workshop artifact names, including the generated production cut contour. */
export const WORKSHOP_REQUIRED_ARTIFACTS = [
  "model-glb", "model-stl", "model-3mf", "depth", "silhouette", "evidence",
  "registration", "layer-coverage", "cut-contour",
] as const;
export const LEGACY_WORKSHOP_ENGINE_SHA256 = "19837027de0359ff98d365db63ff3886e444b8271672114c9e793944036adaf9";
export const LEGACY_WORKSHOP_ARTIFACT_KEYS = [
  "candidate", "depth", "difference", "evidence", "layer-coverage", "manifest", "model-3mf", "model-glb",
  "model-stl", "overlay", "registration", "revision", "silhouette", "uv-artwork", "varnish-mask", "white-mask",
] as const;
export type WorkshopLayer = typeof WORKSHOP_LAYERS[number];
export type WorkshopRequiredArtifact = typeof WORKSHOP_REQUIRED_ARTIFACTS[number];
export interface WorkshopArtifact {
  bytes: number;
  sha256: string;
  content_type: string;
}
export interface WorkshopRevision {
  id: string;
  spec_hash: string;
  state: "queued" | "running" | "completed" | "failed";
  attempts: number;
  created_at: number;
  error: string | null;
  spec: {
    recipe: { width_mm: number; relief_depth_mm: number; base_thickness_mm: number };
    sample: string | null;
  };
  result: {
    digital_geometry_status: string;
    digital_failures: string[];
    digital_warnings: string[];
    artwork_file_set_status: string;
    artwork_semantic_registration_status: "not_validated" | "validated" | "failed";
    physical_validation_status: "pending";
    production_status: "not_approved";
    physical_width_mm: number;
    physical_height_mm: number;
    coverage: Record<string, unknown>;
    artifacts: Record<string, WorkshopArtifact>;
    artifact_contract_status?: "legacy_missing_cut_contour";
  } | null;
}

export function workshopWorkerPath(parts: string[], method: string): string | null {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!parts.length && ["GET", "POST"].includes(method)) return "/revisions";
  if (!uuid.test(parts[0] ?? "")) return null;
  if (method === "GET" && parts.length === 1) return `/revisions/${parts[0]}`;
  if (method === "POST" && parts.length === 2 && parts[1] === "retry") return `/revisions/${parts[0]}/retry`;
  if (method === "GET" && parts.length === 3 && parts[1] === "artifacts" && /^[a-z0-9-]{1,40}$/.test(parts[2])) {
    return `/revisions/${parts[0]}/artifacts/${parts[2]}`;
  }
  return null;
}

export async function readBoundedBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("request_too_large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
