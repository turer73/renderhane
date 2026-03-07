import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";
import { type NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  // Use a precise regex to detect embed routes (prevents path traversal)
  const isEmbed = /^\/[a-z]{2}\/embed\//.test(request.nextUrl.pathname);

  // Security headers — CSP with XSS protection directives
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.fal.media https://assets.renderhane.com https://*.supabase.co",
    "font-src 'self'",
    "connect-src 'self' https://*.supabase.co https://*.fal.media https://www.google-analytics.com",
    "media-src 'self' blob: https://assets.renderhane.com https://*.fal.media",
    `frame-ancestors ${isEmbed ? "'self'" : "'none'"}`,
  ].join("; ");

  response.headers.set("Content-Security-Policy", cspDirectives);
  response.headers.set("X-Frame-Options", isEmbed ? "SAMEORIGIN" : "DENY");

  // HSTS — critical for a site handling payments
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload"
  );

  // Permissions Policy — restrict browser feature access
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  // Embed pages are public — skip auth session refresh
  if (isEmbed) {
    return response;
  }

  return await updateSession(request, response);
}

export const config = {
  matcher: "/((?!api|trpc|ref|icon|apple-icon|opengraph-image|manifest|_next|_vercel|.*\\..*).*)",
};
