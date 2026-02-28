import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Detect Supabase Storage signed URLs and re-sign them with a fresh TTL.
 *
 * Signed URL format:
 *   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
 *
 * If the URL doesn't match this pattern, it's returned unchanged (safe for
 * external URLs from fal.media, assets.renderhane.com, etc.).
 */
export async function refreshSignedUrl(
  supabase: SupabaseClient,
  url: string | null
): Promise<string | null> {
  if (!url) return null;

  try {
    const u = new URL(url);

    // Match: /storage/v1/object/sign/{bucket}/{...path}
    const match = u.pathname.match(
      /\/storage\/v1\/object\/sign\/([^/]+)\/(.+)/
    );
    if (!match) return url; // Not a Supabase signed URL — use as-is

    const bucket = match[1];
    const path = decodeURIComponent(match[2]);

    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600); // 1 hour

    return data?.signedUrl || url;
  } catch {
    return url; // Fallback to original on any error
  }
}
