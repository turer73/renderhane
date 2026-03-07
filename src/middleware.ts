import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";
import { type NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);

  // Use a precise regex to detect embed routes (prevents path traversal)
  const isEmbed = /^\/[a-z]{2}\/embed\//.test(request.nextUrl.pathname);

  // Security headers
  // frame-ancestors must be in enforcing CSP (not supported in report-only)
  response.headers.set(
    "Content-Security-Policy",
    `frame-ancestors ${isEmbed ? "'self'" : "'none'"}`
  );
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
