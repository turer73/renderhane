/**
 * Converts an external asset URL to a same-origin proxy URL.
 *
 * Needed because R2 (assets.renderhane.com) doesn't serve CORS headers,
 * so browser-side Three.js / fetch calls get blocked. The proxy route
 * at /api/assets/proxy fetches server-side and streams back with
 * proper CORS headers.
 *
 * Only proxies known external domains; leaves relative URLs untouched.
 */

const PROXY_HOSTS = ["assets.renderhane.com", "v3b.fal.media", "fal.media"];

export function proxyUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const needsProxy = PROXY_HOSTS.some(
      (host) =>
        parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
    if (needsProxy) {
      return `/api/assets/proxy?url=${encodeURIComponent(url)}`;
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return url;
}
