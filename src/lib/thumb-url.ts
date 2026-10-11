/** Public origin of the R2 bucket that stores generated outputs. */
export const ASSET_ORIGIN = "https://assets.renderhane.com";

/** Widths /api/assets/thumb will render (2x the 40px and 80px gallery tiles). */
export const THUMB_WIDTHS = [80, 160] as const;
export type ThumbWidth = (typeof THUMB_WIDTHS)[number];

/**
 * Small square thumbnail URL for an output stored in our R2 bucket.
 * Anything else (fal.media fallbacks, signed upload URLs, data:/blob:) is
 * returned unchanged and loads as before.
 */
export function thumbUrl(url: string, width: ThumbWidth): string {
  try {
    if (new URL(url).origin === ASSET_ORIGIN) {
      return `/api/assets/thumb?url=${encodeURIComponent(url)}&w=${width}`;
    }
  } catch {
    // Relative or malformed URL — leave it as is.
  }
  return url;
}
