import createIntlMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/middleware";
import { type NextRequest } from "next/server";

const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const response = intlMiddleware(request);
  const isEmbed = request.nextUrl.pathname.includes("/embed/");

  // Security headers — set CSP conditionally for embed vs non-embed routes
  response.headers.set(
    "Content-Security-Policy",
    isEmbed ? "frame-ancestors 'self'" : "frame-ancestors 'none'"
  );
  if (!isEmbed) {
    response.headers.set("X-Frame-Options", "DENY");
  } else {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  // Embed pages are public — skip auth session refresh
  if (isEmbed) {
    return response;
  }

  return await updateSession(request, response);
}

export const config = {
  matcher: "/((?!api|trpc|ref|_next|_vercel|.*\\..*).*)",
};
