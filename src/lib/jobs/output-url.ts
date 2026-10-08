/** Shared by the webhook processor and its status/result recovery path. */
export function extractOutputUrl(payload: Record<string, unknown>): string | null {
  const modelMesh = payload.model_mesh as { url?: string } | undefined;
  if (modelMesh?.url) return modelMesh.url;
  const modelGlb = payload.model_glb as { url?: string } | undefined;
  if (modelGlb?.url) return modelGlb.url;
  const glb = payload.glb as { url?: string } | undefined;
  if (glb?.url) return glb.url;
  const mesh = payload.mesh as { url?: string } | undefined;
  if (mesh?.url) return mesh.url;
  const video = payload.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  const image = payload.image as { url?: string } | undefined;
  if (image?.url) return image.url;
  if (typeof payload.result_url === "string") return payload.result_url;
  const images = payload.images as { url?: string }[] | undefined;
  if (images?.[0]?.url) return images[0].url;
  const output = payload.output as { url?: string } | undefined;
  if (output?.url) return output.url;
  for (const value of Object.values(payload)) {
    if (typeof value === "object" && value !== null && "url" in value) {
      const url = (value as { url?: string }).url;
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
  }
  const urlMatch = JSON.stringify(payload).match(/"url"\s*:\s*"(https?:\/\/[^"]+)"/);
  return urlMatch?.[1] ?? null;
}
