import { isAssetHost } from "./proxy-url";

/** Widths /api/assets/thumb will render (2x the 40px and 80px gallery tiles). */
export const THUMB_WIDTHS = [80, 160] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/**
 * Small square thumbnail URL for an output or source image on our asset hosts.
 * Anything else (data:/blob: fallbacks, other hosts) is returned unchanged.
 */
export function thumbUrl(url: string, width: ThumbWidth): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" && isAssetHost(parsed.hostname)) {
      return `/api/assets/thumb?url=${encodeURIComponent(url)}&w=${width}`;
    }
  } catch {
    // Relative or malformed URL — leave it as is.
  }
  return url;
}
